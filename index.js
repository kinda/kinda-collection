"use strict";

var _ = require('lodash');
var util = require('kinda-util').create();
var KindaObject = require('kinda-object');

var KindaCollection = KindaObject.extend('KindaCollection', function() {
  var parentPrototype = this;
  this.Item = require('./item').extend('Item', function() {
    this.parentPrototype = parentPrototype;
  });

  Object.defineProperty(this, 'table', {
    get: function() {
      return this._table;
    },
    set: function(table) {
      this._table = table;
    }
  });

  Object.defineProperty(this, 'database', {
    get: function() {
      if (this.context && this.context.databaseTransaction)
        return this.context.databaseTransaction;
      else
        return this.table.database;
    }
  });

  this.create = function(json) {
    return this._createOrUnserialize(json, 'create');
  };

  this.unserialize = function(json) {
    return this._createOrUnserialize(json, 'unserialize');
  };

  this.normalize = function(json) {
    return this.unserialize(json).serialize();
  };

  this._createOrUnserialize = function(json, mode) {
    if (typeof json === 'number' || typeof json === 'string') {
      var value = json;
      json = {};
      var itemProto = this.Item.getPrototype();
      json[itemProto.getPrimaryKeyName()] = value;
    }
    var item;
    if (mode === 'create')
      item = this.Item.create(json);
    else
      item = this.Item.unserialize(json);
    item.parentCollection = this;
    item.context = this.context;
    if (this.fixedForeignKey) {
      item[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    item.emit('didCreateOrUnserializeItem');
    return item;
  }

  this.get = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    var key = item.getPrimaryKeyValue();
    var json = yield this.database.get(this.table, key, options);
    if (!json) return;
    item.replaceValue(json);
    item.emit('didLoad');
    return item;
  };

  this.put = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    try {
      item.isSaving = true;
      yield item.emitAsync('willSave');
      item.validate();
      var key = item.getPrimaryKeyValue();
      var json = item.serialize();
      options = _.clone(options);
      if (item.isNew) options.errorIfExists = true;
      json = yield this.database.put(this.table, key, json, options);
      if (json) item.replaceValue(json);
      yield item.emitAsync('didSave');
    } finally {
      item.isSaving = false;
    }
    return item;
  };

  this.del = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    try {
      item.isDeleting = true;
      yield item.emitAsync('willDelete');
      var key = item.getPrimaryKeyValue();
      yield this.database.del(this.table, key, options);
      yield item.emitAsync('didDelete');
    } finally {
      item.isDeleting = false;
    }
  };

  this.getMany = function *(items, options) {
    if (!_.isArray(items))
      throw new Error("invalid 'items' parameter (should be an array)");
    items = items.map(this.normalizeItem.bind(this));
    options = this.normalizeOptions(options);
    var keys = _.invoke(items, 'getPrimaryKeyValue');
    var results = yield this.database.getMany(this.table, keys, options);
    var items = [];
    for (var i = 0; i < results.length; i++) {
      // TODO: like this.get, try to reuse the passed items instead of
      // building new one
      var result = results[i];
      var item = this.unserialize(result.value);
      item.emit('didLoad');
      items.push(item);
    }
    return items;
  };

  this.getRange = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    var results = yield this.database.getRange(this.table, options);
    var items = [];
    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      var item = this.unserialize(result.value);
      item.emit('didLoad');
      items.push(item);
    }
    return items;
  };

  this.getCount = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return yield this.database.getCount(this.table, options);
  };

  this.delRange = function *(options) {
    options = this.normalizeOptions(options);
    yield this.forRange(options, function *(item) {
      yield this.del(item, { errorIfMissing: false });
    }, this);
  };

  this.forRange = function *(options, fn, thisArg) {
    options = this.normalizeOptions(options);
    options = _.clone(options);
    options.limit = 250;
    while (true) {
      var items = yield this.getRange(options);
      if (!items.length) break;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        yield fn.call(thisArg, item);
      }
      var lastItem = _.last(items);
      options.startAfter = this.makeRangeKey(lastItem, options);
      delete options.start;
      delete options.startBefore;
      delete options.value;
    };
  };

  this.injectFixedForeignKey = function(options) {
    if (this.fixedForeignKey) {
      options = _.clone(options);
      var by = options.by || [];
      if (!_.isArray(by)) by = [by];
      by.unshift(this.fixedForeignKey.name);
      options.by = by;
      var prefix = options.prefix || [];
      if (!_.isArray(prefix)) prefix = [prefix];
      prefix.unshift(this.fixedForeignKey.value);
      options.prefix = prefix;
    }
    return options;
  };

  this.makeRangeKey = function(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    var key = item.getPrimaryKeyValue();
    var json = item.serialize();
    return this.database.makeRangeKey(
      this.table, key, json, options
    );
  };

  this.call = function *(item, action, params, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    var key = item.getPrimaryKeyValue();
    return yield this.database.call(this.table, key, action, params, options);
  };

  this.transaction = function *(fn, options) {
    if (!this.context)
      throw new Error('cannot start a transaction without a context');
    if (this.context.databaseTransaction) return yield fn();
    return yield this.database.transaction(function *(tr) {
      this.context.databaseTransaction = tr;
      try {
        return yield fn();
      } finally {
        this.context.databaseTransaction = undefined;
      }
    }.bind(this), options);
  };

  this.parseURL = function(url) { // extract primary key from an URL
    return this.database.parseURL(this.table, url);
  };

  this.normalizeItem = function(item) {
    if (!item) throw new Error('key or item is empty');
    if (!(item.isInstanceOf && item.isInstanceOf(this.Item))) {
      item = this.create(item);
    }
    return item;
  };

  this.normalizeOptions = function(options) {
    if (!options) options = {};
    return options;
  };
});

module.exports = KindaCollection;
