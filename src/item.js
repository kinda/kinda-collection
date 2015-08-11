'use strict';

let _ = require('lodash');
let idgen = require('idgen');
let Model = require('kinda-model');
let Relation = require('./relation');

let Item = Model.extend('Item', function() {
  let superCreator = this.creator;
  this.creator = function(collection, value) {
    this.collection = collection;
    superCreator.call(this, value);
  };

  let superUnserializer = this.unserializer;
  this.unserializer = function(collection, json) {
    this.collection = collection;
    superUnserializer.call(this, json);
  };

  Object.defineProperty(this, 'collection', {
    get() {
      return this._collection;
    },
    set(collection) {
      this._collection = collection;
    }
  });

  Object.defineProperty(this, 'repository', {
    get() {
      return this.collection.repository;
    }
  });

  Object.defineProperty(this, 'app', {
    get() {
      return this.repository.app;
    }
  });

  Object.defineProperty(this, 'primaryKeyProperty', {
    get() {
      return this._primaryKeyProperty;
    },
    set(prop) {
      this._primaryKeyProperty = prop;
    }
  });

  Object.defineProperty(this, 'primaryKeyName', {
    get() {
      if (!this.primaryKeyProperty) {
        throw new Error('primary key property is missing');
      }
      return this.primaryKeyProperty.name;
    }
  });

  Object.defineProperty(this, 'primaryKeyValue', {
    get() {
      if (!this.primaryKeyProperty) {
        throw new Error('primary key property is missing');
      }
      return this[this.primaryKeyName];
    }
  });

  this.addPrimaryKeyProperty = function(name = 'id', type, options = {}) {
    if (!options.hasOwnProperty('isAuto')) options.isAuto = true;
    let prop = this.addKeyProperty(name, type, options);
    if (options.max) this._maxKeyValue = options.max;
    this.primaryKeyProperty = prop;
  };

  Object.defineProperty(this, 'foreignKeyProperties', {
    get() {
      if (!this._foreignKeyProperties) this._foreignKeyProperties = {};
      return this._foreignKeyProperties;
    }
  });

  this.addForeignKeyProperty = function(name, type, options) {
    let prop = this.addKeyProperty(name, type, options);
    this.foreignKeyProperties[name] = prop;
  };

  this.addKeyProperty = function(name, type = String, options = {}) {
    if (!(typeof name === 'string' && name)) throw new Error('name is missing');
    let prop = this.addProperty(name, type);
    if (options.isAuto) {
      this.on('willSave', async function() {
        if (this.repository.isLocal) {
          this.generateKeyValue(prop);
        }
      });
    }
    return prop;
  };

  this.addCreatedOnProperty = function(name = 'createdOn') {
    let prop = this.addProperty(name, Date);
    this.on('willSave', async function() {
      if (this.repository.isLocal) {
        if (!this[name]) this[name] = new Date();
      }
    });
    return prop;
  };

  this.addUpdatedOnProperty = function(name = 'updatedOn') {
    let prop = this.addProperty(name, Date);
    this.on('willSave', async function(options) {
      if (!this.repository.isLocal) return;
      if (options.source === 'computer' || options.source === 'localSynchronizer' || options.source === 'remoteSynchronizer' || options.source === 'archive') return;
      this[name] = new Date();
    });
    return prop;
  };

  Object.defineProperty(this, 'relations', {
    get() {
      if (!this._relations) this._relations = {};
      return this._relations;
    }
  });

  this.addHasManyRelation = function(name, collectionName, foreignKey, options = {}) {
    options.type = 'hasMany';

    let relation = Relation.create(name, collectionName, foreignKey, options);
    this.relations[name] = relation;

    Object.defineProperty(this, name, {
      get() {
        if (!this.hasOwnProperty('_relationValues')) this._relationValues = {};
        let val = this._relationValues[name];
        if (!val) {
          val = this.repository.createCollection(collectionName);
          this._relationValues[name] = val;
          val.fixedForeignKey = {
            name: foreignKey,
            value: this.primaryKeyValue
          };
        }
        return val;
      },
      enumerable: true
    });

    this.on('didDelete', async function() {
      if (this.repository.isLocal) {
        let items = await this[name].findItems();
        for (let item of items) await item.delete({ source: 'computer' });
      }
    });
  };

  Object.defineProperty(this, 'indexes', {
    get() {
      if (!this._indexes) this._indexes = [];
      return this._indexes;
    }
  });

  this.addIndex = function(properties, options = {}) {
    options.properties = properties;
    this.indexes.push(options);
  };

  Object.defineProperty(this, 'isNew', {
    get() {
      return !this._isSaved;
    },
    set(val) {
      this._isSaved = !val;
    }
  });

  Object.defineProperty(this, 'isModified', {
    get() {
      return this._isModified;
    },
    set(val) {
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

  this.on('didSave', async function() {
    this.isNew = false;
    this.isModified = false;
  });

  this.on('didChange', function() {
    this.isModified = true;
  });

  this.generateKeyValue = function(prop) {
    if (_.isString(prop)) prop = this.getProperty(prop);
    if (!prop) throw new Error('unknown property');
    if (this[prop.name]) return; // a value has already been generated
    let val;
    if (prop.type === String) {
      val = idgen(16);
    } else if (prop.type === Number) {
      let max = this._maxKeyValue || 2000000000;
      val = Math.floor(Math.random() * max) + 1;
    } else {
      throw new Error('unsupported key type');
    }
    this[prop.name] = val;
  };

  this.generatePrimaryKeyValue = function() {
    this.generateKeyValue(this.primaryKeyProperty);
  };

  Object.defineProperty(this, 'superclassesWithPrimaryKeyProperty', {
    get() {
      let classes = [];
      this.superclasses.forEach(function(superclass) {
        let prototype = superclass.prototype;
        if (!prototype.primaryKeyProperty) return;
        classes.push(superclass);
      });
      return classes;
    }
  });

  Object.defineProperty(this, 'classNames', {
    get() {
      let classes = this.superclassesWithPrimaryKeyProperty;
      let classNames = _.pluck(classes, 'name');
      classNames.unshift(this.class.name);
      classNames = _.uniq(classNames);
      return classNames;
    }
  });

  // === Operations ===

  this.load = async function(options = {}) {
    let item = await this.collection.getItem(this, options);
    if (!item && options.errorIfMissing === false) return;
    if (item !== this) {
      throw new Error('Item.prototype.load() returned an item from a different class');
    }
  };

  this.save = async function(options) {
    await this.collection.putItem(this, options);
  };

  this.delete = async function(options) {
    return await this.collection.deleteItem(this, options);
  };

  this.call = async function(method, options, body) {
    return await this.collection.callItem(this, method, options, body);
  };

  this.transaction = async function(fn, options) {
    if (this.isInsideTransaction) return await fn(this);
    let newItem;
    let result = await this.collection.transaction(async function(newCollection) {
      newItem = newCollection.unserializeItem(this);
      newItem.isNew = this.isNew;
      newItem.isModified = this.isModified;
      return await fn(newItem);
    }.bind(this), options);
    this.replaceValue(newItem);
    this.isNew = newItem.isNew;
    this.isModified = newItem.isModified;
    return result;
  };

  Object.defineProperty(this, 'isInsideTransaction', {
    get() {
      return this.collection.isInsideTransaction;
    }
  });

  this.makeURL = function(method, options) {
    return this.repository.makeURL(
      this.collection, this, method, options
    );
  };
});

module.exports = Item;
