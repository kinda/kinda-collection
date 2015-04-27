"use strict";

var KindaObject = require('kinda-object');

var Relation = KindaObject.extend('Relation', function() {
  this.setCreator(function(name, collectionName, foreignKey, options) {
    if (typeof name !== 'string' || !name)
      throw new Error('name is missing');
    if (!collectionName)
      throw new Error('collectionName is missing');
    if (typeof foreignKey !== 'string' || !foreignKey)
      throw new Error('foreignKey is missing');
    if (!options) options = {};
    if (!options.type)
      throw new Error('type is missing');
    this.name = name;
    this.collectionName = collectionName;
    this.foreignKey = foreignKey;
    this.type = options.type;
  });

  var supportedTypes = ['hasMany'];

  Object.defineProperty(this, 'type', {
    get: function() {
      return this._type;
    },
    set: function(type) {
      if (supportedTypes.indexOf(type) === -1)
        throw new Error('invalid type');
      this._type = type;
    },
    enumerable: true
  });
});

module.exports = Relation;
