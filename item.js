"use strict";

var nodeURL = require('url');
var _ = require('lodash');
var util = require('kinda-util').create();
var idgen = require('idgen');
var Model = require('kinda-model');
var Relation = require('./relation');

var Item = Model.extend('Item', function() {
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
        if (false) yield false;
        if (this.parentCollection.database.isFinal) // TODO: improve this
          this.generateKeyValue(prop);
      });
    }
    return prop;
  };

  this.addCreatedOnProperty = function(name, options) {
    if (!name) name = 'createdOn';
    var prop = this.addProperty(name, Date);
    this.onAsync('willSave', function *() {
      if (false) yield false;
      if (this.parentCollection.database.isFinal)
        if (!this[name]) this[name] = new Date;
    });
    return prop;
  };

  this.addUpdatedOnProperty = function(name, options) {
    if (!name) name = 'updatedOn';
    var prop = this.addProperty(name, Date);
    this.onAsync('willSave', function *() {
      if (false) yield false;
      if (this.parentCollection.database.isFinal)
        this[name] = new Date;
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

  this.onAsync('didLoad', function *() {
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
    yield this.parentCollection.get(this, options);
  };

  this.save = function *(options) {
    yield this.parentCollection.put(this, options);
  };

  this.del = function *(options) {
    yield this.parentCollection.del(this, options);
  };

  this.call = function *(action, params, options) {
    return yield this.parentCollection.call(this, action, params, options);
  };

  this.transaction = function *(fn, options) {
    return yield this.parentCollection.transaction(fn, options);
  };

  this.getURL = function() {
    var db = this.parentCollection.database;
    var table = this.parentCollection.table;
    var key = this.getPrimaryKeyValue();
    return db.makeURL(table, key, undefined, undefined, { includeToken: false });
  };
});

module.exports = Item;
