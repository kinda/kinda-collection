"use strict";

var nodeURL = require('url');
var _ = require('lodash');
var util = require('kinda-util').create();
var idgen = require('idgen');
var Model = require('kinda-model');
var Relation = require('./relation');

var Item = Model.extend('Item', function() {
  this.getCollection = function() {
    return this._collection;
  };

  this.setCollection = function(collection) {
    this._collection = collection;
  };

  this.getPrimaryKeyProperty = function() {
    var prop = this._primaryKey;
    if (!prop) throw new Error('primary key property is missing');
    return prop;
  };

  this.addPrimaryKeyProperty = function(name, type, options) {
    if (!name) name = 'id';
    if (!options) options = {};
    if (!options.hasOwnProperty('isAuto'))
      options.isAuto = true;
    var prop = this.addKeyProperty(name, type, options);
    if (options.max) this._maxKeyValue = options.max;
    this._primaryKey = prop;
  };

  this.getForeignKeyProperties = function() {
    if (!this._foreignKeys)
      this._foreignKeys = {};
    return this._foreignKeys;
  }

  this.addForeignKeyProperty = function(name, type, options) {
    var prop = this.addKeyProperty(name, type, options);
    this.getForeignKeyProperties()[name] = prop;
  }

  this.addKeyProperty = function(name, type, options) {
    if (typeof name !== 'string' || !name)
      throw new Error('name is missing');
    if (!type) type = String;
    if (!options) options = {};
    var prop = this.addProperty(name, type);
    if (options.isAuto) {
      this.onAsync('willSave', function *() {
        // TODO: improve this
        if (this.getCollection().getRepository().isLocal) {
          this.generateKeyValue(prop);
        }
      });
    }
    return prop;
  };

  this.addCreatedOnProperty = function(name, options) {
    if (!name) name = 'createdOn';
    var prop = this.addProperty(name, Date);
    this.onAsync('willSave', function *() {
      // TODO: improve this
      if (this.getCollection().getRepository().isLocal) {
        if (!this[name]) this[name] = new Date;
      }
    });
    return prop;
  };

  this.addUpdatedOnProperty = function(name, options) {
    if (!name) name = 'updatedOn';
    var prop = this.addProperty(name, Date);
    this.onAsync('willSave', function *() {
      // TODO: improve this
      if (this.getCollection().getRepository().isLocal) {
        this[name] = new Date;
      }
    });
    return prop;
  };

  this.getRelations = function() {
    if (!this._relations)
      this._relations = {};
    return this._relations;
  }

  this.addHasManyRelation = function(name, klass, foreignKey, options) {
    if (!options) options = {};
    options.type = 'hasMany';

    var relation = Relation.create(name, klass, foreignKey, options);
    this.getRelations()[name] = relation;

    Object.defineProperty(this, name, {
      get: function() {
        if (!this.hasOwnProperty('_relationValues'))
          this._relationValues = {};
        var val = this._relationValues[name];
        if (!val) {
          this._relationValues[name] = val = klass.create();
          val.context = this.context;
          val.fixedForeignKey = {
            name: foreignKey,
            value: this.getPrimaryKeyValue()
          };
        }
        return val;
      },
      enumerable: true
    });

    this.onAsync('didDelete', function *() {
      if (this.getCollection().getRepository().isLocal) {
        var items = yield this[name].findItems();
        for (var i = 0; i < items.length; i++) {
          yield items[i].delete();
        }
      }
    });
  };

  this.getIndexes = function() {
    if (!this._indexes) this._indexes = [];
    return this._indexes;
  };

  this.addIndex = function(properties, options) {
    var index = options || {};
    index.properties = properties;
    this.getIndexes().push(index);
  };

  Object.defineProperty(this, 'isNew', {
    get: function() {
      return !this._isSaved;
    },
    set: function(val) {
      this._isSaved = !val;
    }
  });

  Object.defineProperty(this, 'isModified', {
    get: function() {
      return this._isModified;
    },
    set: function(val) {
      this._isModified = val;
    }
  });

  this.on('didCreateOrUnserializeItem', function() {
    this.isModified = false;
  });

  this.on('didLoad', function() {
    this.isNew = false;
    this.isModified = false;
  });

  this.onAsync('didSave', function *() {
    this.isNew = false;
    this.isModified = false;
  });

  this.on('didChange', function() {
    this.isModified = true;
  });

  this.generateKeyValue = function(prop) {
    if (_.isString(prop)) prop = this.getProperty(prop);
    if (!prop) throw new Error('unknown property');
    if (this[prop.name]) return;
    var val;
    if (prop.type === String)
      val = idgen(16);
    else if (prop.type === Number) {
      var max = this._maxKeyValue || 2000000000;
      val = Math.floor(Math.random() * max) + 1;
    } else
      throw new Error('unsupported key type');
    this[prop.name] = val;
  };

  this.getPrimaryKeyName = function() {
    var prop = this.getPrimaryKeyProperty();
    return prop.name;
  };

  this.getPrimaryKeyValue = function() {
    var prop = this.getPrimaryKeyProperty();
    return this[prop.name];
  };

  this.generatePrimaryKeyValue = function() {
    var prop = this.getPrimaryKeyProperty();
    this.generateKeyValue(prop);
  };

  this.getToken = function() {
    return this._token;
  };

  this.setToken = function(token) {
    this._token = token;
  };

  this.load = function *(options) {
    yield this.getCollection().getItem(this, options);
  };

  this.save = function *(options) {
    yield this.getCollection().putItem(this, options);
  };

  this.delete = function *(options) {
    yield this.getCollection().deleteItem(this, options);
  };

  this.call = function *(method, options, body) {
    return yield this.getCollection().callItem(this, method, options, body);
  };

  this.transaction = function *(fn, options) {
    return yield this.getCollection().transaction(fn, options);
  };

  this.makeURL = function(method, options) {
    var collection = this.getCollection();
    return collection.getRepository().makeURL(collection, this, method, options);
  };
});

module.exports = Item;
