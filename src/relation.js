'use strict';

let KindaObject = require('kinda-object');

let Relation = KindaObject.extend('Relation', function() {
  this.creator = function(name, collectionName, foreignKey, options = {}) {
    if (typeof name !== 'string' || !name) throw new Error('name is missing');
    if (!collectionName) throw new Error('collectionName is missing');
    if (!(typeof foreignKey === 'string' && foreignKey)) {
      throw new Error('foreignKey is missing');
    }
    if (!options.type) throw new Error('type is missing');
    this.name = name;
    this.collectionName = collectionName;
    this.foreignKey = foreignKey;
    this.type = options.type;
  };

  let supportedTypes = ['hasMany'];

  Object.defineProperty(this, 'type', {
    get() {
      return this._type;
    },
    set(type) {
      if (supportedTypes.indexOf(type) === -1) throw new Error('invalid type');
      this._type = type;
    },
    enumerable: true
  });
});

module.exports = Relation;
