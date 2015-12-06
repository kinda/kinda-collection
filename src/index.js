'use strict';

let _ = require('lodash');
let KindaObject = require('kinda-object');

let KindaCollection = KindaObject.extend('KindaCollection', function() {
  this.Item = require('./item');

  this.creator = function(repository) {
    this.repository = repository;
  };

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

  Object.defineProperty(this, 'app', {
    get() {
      return this.repository.app;
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
    if (mode === 'create') item = this.Item.create(this, json);
    else item = this.Item.unserialize(this, json);
    if (this.fixedForeignKey) {
      item[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    return item;
  };

  this.getItem = async function(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    item = await this.repository.getItem(item, options);
    if (item) {
      item.isNew = false;
      item.isModified = false;
      // item.emit('didLoad', options);
    }
    return item;
  };

  this.putItem = async function(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    let validate = options.validate != null ? options.validate : true;
    try {
      item.isSaving = true;
      await item.transaction(async function(savingItem) {
        await savingItem.emit('willSave', options);
        if (validate) savingItem.validate();
        await savingItem.repository.putItem(savingItem, options);
      });
      item.isNew = false;
      item.isModified = false;
      await item.emit('didSave', options);
      this.repository.log.debug(item.class.name + '#' + item.primaryKeyValue + ' saved to ' + (this.repository.isLocal ? 'local' : 'remote') + ' repository');
    } finally {
      item.isSaving = false;
    }
    return item;
  };

  this.deleteItem = async function(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    let hasBeenDeleted;
    try {
      item.isDeleting = true;
      await item.transaction(async function(deletingItem) {
        await deletingItem.emit('willDelete', options);
        hasBeenDeleted = await deletingItem.repository.deleteItem(deletingItem, options);
      });
      if (hasBeenDeleted) {
        await item.emit('didDelete', options);
        this.repository.log.debug(item.class.name + '#' + item.primaryKeyValue + ' deleted from ' + (this.repository.isLocal ? 'local' : 'remote') + ' repository');
      }
    } finally {
      item.isDeleting = false;
    }
    return hasBeenDeleted;
  };

  this.getItems = async function(items, options) {
    if (!_.isArray(items)) {
      throw new Error('invalid \'items\' parameter (should be an array)');
    }
    items = items.map(this.normalizeItem.bind(this));
    options = this.normalizeOptions(options);
    items = await this.repository.getItems(items, options);
    for (let item of items) {
      item.isNew = false;
      item.isModified = false;
      // item.emit('didLoad', options);
    }
    return items;
  };

  this.findItems = async function(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    let items = await this.repository.findItems(this, options);
    for (let item of items) {
      item.isNew = false;
      item.isModified = false;
      // item.emit('didLoad', options);
    }
    return items;
  };

  this.countItems = async function(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return await this.repository.countItems(this, options);
  };

  this.forEachItems = async function(options, fn, thisArg) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    await this.repository.forEachItems(this, options, async function(item) {
      item.isNew = false;
      item.isModified = false;
      // item.emit('didLoad', options);
      await fn.call(this, item);
    }, thisArg);
  };

  this.findAndDeleteItems = async function(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    // FIXME: 'willDelete' and 'didDelete' event should be emitted for each items
    return await this.repository.findAndDeleteItems(this, options);
  };

  this.call = async function(method, options, body) {
    return await this.callCollection(method, options, body);
  };

  this.callCollection = async function(method, options, body) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return await this.repository.call(this, undefined, method, options, body);
  };

  this.callItem = async function(item, method, options, body) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    return await this.repository.call(this, item, method, options, body);
  };

  this.transaction = async function(fn, options) {
    if (this.isInsideTransaction) return await fn(this);
    return await this.repository.transaction(async function(newRepository) {
      let newCollection = newRepository.createCollection(this.class.name);
      if (this.fixedForeignKey) {
        newCollection.fixedForeignKey = this.fixedForeignKey;
      }
      return await fn(newCollection);
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
      item = this.unserializeItem(item);
    }
    return item;
  };

  this.normalizeOptions = function(options) {
    if (!options) options = {};
    return options;
  };
});

module.exports = KindaCollection;
