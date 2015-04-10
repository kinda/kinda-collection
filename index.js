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
    var repository = this.context && this.context.repositoryTransaction;
    if (!repository) repository = this._repository;
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
    try {
      item.isSaving = true;
      yield item.emitAsync('willSave');
      item.validate();
      yield this.getRepository().putItem(item, options);
      yield item.emitAsync('didSave');
    } finally {
      item.isSaving = false;
    }
    return item;
  };

  this.deleteItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    try {
      item.isDeleting = true;
      yield item.emitAsync('willDelete');
      yield this.getRepository().deleteItem(item, options);
      yield item.emitAsync('didDelete');
    } finally {
      item.isDeleting = false;
    }
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

  this.forEachItems = function *(options, fn, thisArg) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    yield this.getRepository().forEachItems(this, options, fn, thisArg);
  };

  this.findAndDeleteItems = function *(options) {
    options = this.normalizeOptions(options);
    yield this.forEachItems(options, function *(item) {
      yield this.deleteItem(item, { errorIfMissing: false });
    }, this);
  };

  // this.call = function *(item, action, params, options) {
  //   item = this.normalizeItem(item);
  //   options = this.normalizeOptions(options);
  //   var key = item.getPrimaryKeyValue();
  //   return yield this.database.call(this.table, key, action, params, options);
  // };

  this.transaction = function *(fn, options) {
    if (!this.context)
      throw new Error('cannot start a transaction without a context');
    if (this.context.repositoryTransaction) return yield fn();
    return yield this.getRepository().transaction(function *(tr) {
      this.context.repositoryTransaction = tr;
      try {
        return yield fn();
      } finally {
        this.context.repositoryTransaction = undefined;
      }
    }.bind(this), options);
  };

  this.injectFixedForeignKey = function(options) {
    if (this.fixedForeignKey) {
      options = _.clone(options);
      if (!options.query) options.query = {};
      options.query[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    return options;
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
