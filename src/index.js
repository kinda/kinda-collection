'use strict';

let _ = require('lodash');
let KindaObject = require('kinda-object');

let KindaCollection = KindaObject.extend('KindaCollection', function() {
  this.Item = require('./item');

  Object.defineProperty(this, 'name', {
    get() {
      return this.class.name;
    }
  });

  Object.defineProperty(this, 'repository', {
    get() {
      return this._repository;
    },
    set(repository) {
      this._repository = repository;
    }
  });

  Object.defineProperty(this, 'fixedForeignKey', {
    get() {
      return this._fixedForeignKey;
    },
    set(fixedForeignKey) {
      this._fixedForeignKey = fixedForeignKey;
    }
  });

  this.createItem = function(json) {
    return this._createOrUnserializeItem(json, 'create');
  };

  this.unserializeItem = function(json) {
    return this._createOrUnserializeItem(json, 'unserialize');
  };

  this._createOrUnserializeItem = function(json, mode) {
    if (typeof json === 'number' || typeof json === 'string') {
      let value = json;
      json = {};
      let itemProto = this.Item.prototype;
      json[itemProto.primaryKeyName] = value;
    }
    let item;
    if (mode === 'create') item = this.Item.create(json);
    else item = this.Item.unserialize(json);
    item.collection = this;
    if (this.fixedForeignKey) {
      item[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    item.emit('didCreateOrUnserializeItem');
    return item;
  };

  this.getItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    item = yield this.repository.getItem(item, options);
    if (item) item.emit('didLoad', options);
    return item;
  };

  this.putItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    try {
      item.isSaving = true;
      yield item.transaction(function *(savingItem) {
        yield savingItem.emitAsync('willSave', options);
        savingItem.validate();
        let repository = savingItem.collection.repository;
        yield repository.putItem(savingItem, options);
        yield savingItem.emitAsync('didSave', options);
        repository.log.debug(savingItem.class.name + '#' + savingItem.primaryKeyValue + ' saved to ' + (repository.isLocal ? 'local' : 'remote') + ' repository');
      });
    } finally {
      item.isSaving = false;
    }
    return item;
  };

  this.deleteItem = function *(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    let hasBeenDeleted;
    try {
      item.isDeleting = true;
      yield item.transaction(function *(deletingItem) {
        yield deletingItem.emitAsync('willDelete', options);
        let repository = deletingItem.collection.repository;
        hasBeenDeleted = yield repository.deleteItem(deletingItem, options);
        if (hasBeenDeleted) {
          yield deletingItem.emitAsync('didDelete', options);
          repository.log.debug(deletingItem.class.name + '#' + deletingItem.primaryKeyValue + ' deleted from ' + (repository.isLocal ? 'local' : 'remote') + ' repository');
        }
      });
    } finally {
      item.isDeleting = false;
    }
    return hasBeenDeleted;
  };

  this.getItems = function *(items, options) {
    if (!_.isArray(items)) {
      throw new Error('invalid \'items\' parameter (should be an array)');
    }
    items = items.map(this.normalizeItem.bind(this));
    options = this.normalizeOptions(options);
    items = yield this.repository.getItems(items, options);
    for (let item of items) item.emit('didLoad', options);
    return items;
  };

  this.findItems = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    let items = yield this.repository.findItems(this, options);
    for (let item of items) item.emit('didLoad', options);
    return items;
  };

  this.countItems = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return yield this.repository.countItems(this, options);
  };

  this.forEachItems = function *(options, fn, thisArg) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    yield this.repository.forEachItems(this, options, function *(item) {
      item.emit('didLoad', options);
      yield fn.call(this, item);
    }, thisArg);
  };

  this.findAndDeleteItems = function *(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    // FIXME: 'willDelete' and 'didDelete' event should be emitted for each items
    return yield this.repository.findAndDeleteItems(this, options);
  };

  this.call = function *(method, options, body) {
    return yield this.callCollection(method, options, body);
  };

  this.callCollection = function *(method, options, body) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return yield this.repository.call(this, undefined, method, options, body);
  };

  this.callItem = function *(item, method, options, body) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    return yield this.repository.call(this, item, method, options, body);
  };

  this.transaction = function *(fn, options) {
    if (this.isInsideTransaction) return yield fn(this);
    return yield this.repository.transaction(function *(newRepository) {
      let newCollection = newRepository.createCollection(this.class.name);
      if (this.fixedForeignKey) {
        newCollection.fixedForeignKey = this.fixedForeignKey;
      }
      return yield fn(newCollection);
    }.bind(this), options);
  };

  Object.defineProperty(this, 'isInsideTransaction', {
    get() {
      return this.repository.isInsideTransaction;
    }
  });

  this.makeURL = function(method, options) {
    return this.repository.makeURL(this, undefined, method, options);
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
