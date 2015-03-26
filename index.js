"use strict";

var _ = require('lodash');
var util = require('kinda-util').create();
var KindaObject = require('kinda-object');

var KindaCollection = KindaObject.extend('KindaCollection', function() {
  var parentPrototype = this;
  this.Item = require('./item').extend('Item', function() {
    this.parentPrototype = parentPrototype;
  });

  this.getName = function() {
    return this.getClass().name;
  };

  this.getRepository = function() {
    // TODO: should return a transactional repository
    // in case there is an active transaction
    var repository = this._repository;
    if (!repository) throw new Error('undefined repository');
    return repository;
  };

  this.setRepository = function(repository) {
    this._repository = repository;
  };

  this.createItem = function(json) {
    return this._createOrUnserializeItem(json, 'create');
  };

  this.unserializeItem = function(json) {
    return this._createOrUnserializeItem(json, 'unserialize');
  };

  // this.normalize = function(json) { TODO: remove external references
  //   return this.unserializeItem(json).serialize();
  // };

  this._createOrUnserializeItem = function(json, mode) {
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
    item.setCollection(this);
    item.context = this.context;
    if (this.fixedForeignKey) {
      item[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    item.emit('didCreateOrUnserializeItem');
    return item;
  };

  this.getItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    item = yield this.getRepository().getItem(item, options);
    if (item) item.emit('didLoad');
    return item;
  };

  this.putItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    yield item.emitAsync('willSave');
    item.validate();
    yield this.getRepository().putItem(item, options);
    yield item.emitAsync('didSave');
    return item;
  };

  this.deleteItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    yield item.emitAsync('willDelete');
    yield this.getRepository().deleteItem(item, options);
    yield item.emitAsync('didDelete');
  };

  this.getItems = function *(items, options) {
    if (!_.isArray(items))
      throw new Error("invalid 'items' parameter (should be an array)");
    items = items.map(this.normalizeItem.bind(this));
    options = this.normalizeOptions(options);
    var items = yield this.getRepository().getItems(items, options);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      item.emit('didLoad');
    }
    return items;
  };

  // Options:
  //   filter: specifies the search criterias.
  //     Example: { blogId: 'xyz123', postId: 'abc987' }.
  //   order: specifies the property to order the results by:
  //     Example: ['lastName', 'firstName'].
  //   start, startAfter, end, endBefore: ...
  //   reverse: if true, the search is made in reverse order.
  //   properties: indicates properties to fetch. '*' for all properties
  //     or an array of property name. If an index projection matches
  //     the requested properties, the projection is used.
  //   limit: maximum number of items to return.
  this.findItems = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    var items = yield this.getRepository().findItems(this, options);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      item.emit('didLoad');
    }
    return items;
  };

  this.countItems = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return yield this.getRepository().countItems(this, options);
  };

  this.deleteItems = function *(options) {
    yield this.forEachItems(options, function *(item) {
      yield this.deleteItem(item, { errorIfMissing: false });
    }, this);
  };

  this.forEachItems = function *(options, fn, thisArg) {
    options = this.normalizeOptions(options);
    options = _.clone(options);
    options.limit = 250;
    while (true) {
      var items = yield this.getItems(options);
      if (!items.length) break;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        yield fn.call(thisArg, item);
      }
      var lastItem = _.last(items);
      options.startAfter = this.makeRangeKey(lastItem, options); // <--------
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
      item = this.createItem(item);
    }
    return item;
  };

  this.normalizeOptions = function(options) {
    if (!options) options = {};
    return options;
  };
});

module.exports = KindaCollection;
