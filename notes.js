var People = Collection.extend('People', function() {
  this.Item = this.Item.extend('Person', function() {
    this.addPrimaryKeyProperty('id');
    this.addProperty('firstName');
    this.addProperty('lastName');

    this.addIndex('age');
    this.addIndex(['country', 'city']);
    this.addIndex(
      ['lastName', 'firstName'],
      { projection: ['firstName', 'lastName', 'age'] }
    );
    this.addIndex(function fullNameSortKey(item) {
      return ...;
    });
  });
});

// -------------------------------------------

// frontend app

var repository = RemoteRepository.create(config.api.url);

var Users = Users.extend('Users', function() {
  this.setRepository(repository);
});

// backend server

var repository = DatabaseRepository.create(db);

var Users = Users.extend('Users', function() {
  this.setRepository(repository);
});

var server = RepositoryServer.create();
server.addCollection(BackUsers, FrontUsers, { authorizer: authorizer });
server.addCollection(BackTokens, FrontTokens, { authorizer: authorizer });
server.addCollection(People, People, {
  methods: {
    'getItem': { authorizer: authorizer },
    'putItem': false
  }
});
server.setAuthorizer(authorizer);
api.use(server.getMiddleware());

// ---

this.createItem()
this.unserializeItem()
this.getItem()
this.putItem()
this.deleteItem()
this.getItems()
this.findItems()
this.countItems()
this.deleteItems()
this.forItems()

// -------------------------------------

var db = require('../database');

var Vaults = Collection.extend('Vaults', function() {
  this.include(require('kinda-collection/database'));
  this.setTable(db.getTable('Vaults'));
});

var context = Context.create();
var vaults = context.create(Vaults);
yield vaults.transaction(function *() {
  var vault = yield vaults.get('123');
  var file = vault.files.get('abc');
  file.status = 'available';
  yield file.save();
});

vaults.get
vaults.put
vaults.del

vaults.getMany
vaults.putMany
vaults.delMany

vaults.getRange
vaults.delRange

vault.load
vault.save
vault.del

//

vaults.getRange({ index: 'number', start: 123, end: 123 });

//

vaults.find({ number: 123 });

files.find({ vaultId: '9df3ko' }, { orderBy: 'durability' });

files.find({
  vaultId: '9df3ko3ez',
  durability: { $gte: 2827283 },
  id: { $gt: '6u3r87kl0' }
}, {
  orderBy 'durability'
});

///////////////////////////////////////////

// Version avant l'ajout de kinda-db

var Vaults = Collection.extend('Vaults', function() {
  this.Item = this.Item.extend('Vault', function() {
    this.addPrimaryKey('id');
    this.addHasManyRelation('files', VaultFiles);
    this.addHasManyRelation('operations', FileOperations, { foreignKey: 'vaultId' });
    this.setURLTemplate('{id}');
  });
  this.setURLTemplate('https://api.durable.io/v1/vaults');
});

var VaultFiles = Collection.extend('VaultFiles', function() {
  this.Item = this.Item.extend('VaultFile', function() {
    this.addParentKeyProperty('vaultId');
    this.addPrimaryKeyProperty('id');
    this.addHasManyRelation('operations', FileOperations);
    this.addBelongsToRelation('vault', Vaults);
    this.addAction('finalize', function *(params) {
      // ...
      return result;
    });
    this.setURLTemplate('{id}');
  });
  this.setURLTemplate('https://api.durable.io/v1/vaults/{vaultId}/files');
  this.setAdapter(DynamoDBAdapter.create(function() {
    this.addLocalIndex('date', 'VaultFilesByDate');
    this.addLocalIndex('status', 'VaultFilesByStatus');
    this.addGlobalIndex(['status', 'date'], 'FilesByStatusAndDate');
  }));
});

var FileOperations = Collection.extend('FileOperations', function() {
  this.Item = this.Item.extend('FileOperation', function() {
    this.addParentKeyProperty('fileId');
    this.addPrimaryKeyProperty('id');
    this.addForeignKey('vaultId');
    this.addBelongsToRelation('file', VaultFiles);
    this.addBelongsToRelation('vault', Vault, { foreignKey: 'vaultId' });
    this.setURLTemplate('{id}');
  });
  this.setURLTemplate('https://api.durable.io/v1/files/{fileId}/operations');
  this.setAdapter(DynamoDBAdapter.create(function() {
    this.addIndex(['vaultId', 'date'], 'OperationsByVaultAndDate');
  }));
});

vault = vaults.get('NhUfdeF4H8SmJl4c');

vaultFiles = vaults.get(['NhUfdeF4H8SmJl4c', 'NhVlGuCuYMhz0qbW']);

vaultFiles = vaults.get({ vaultId: 'NhUfdeF4H8SmJl4c', id: 'NhVlGuCuYMhz0qbW' });

///////////////////////////////

counters.createItem('vaultNumber');
counter.update({ count: { action: 'add', value: 1 } })

///////////////////////////////

vault.files.findItems(
  { folderId: '1g8jj5dm0' },
  { orderBy: 'createdOn', descendingOrder: true, limit: 7, startAfter: '3dsg3' }
)

///////////////////////////////

// Base de données

VaultFiles

  Attributes:
    vaultId (hash key)
    id (range key)
    date
    status

  Local Secondary Indexes:
    VaultFilesByDate
      vaultId (hash key)
      date (range key)
    VaultFilesByStatus
      vaultId (hash key)
      status (range key)

  Global Secondary Indexes:
    FilesByStatusAndDate
      status (hask key)
      date (range key)

// Autre possiblité :

Files

  Attributes
    id (hash key)
    vaultId
    date
    status

  Global Secondary Indexes
    VaultFilesByDate
      vaultId (hash key)
      date (range key)
    VaultFilesByStatus
      vaultId (hash key)
      status (range key)
    FilesByStatusAndDate
      status (hash key)
      date (range key)

///////////////////////////////


// collections/vaults
// collections/vaults-public.js
// collections/vaults-private.js

var remoteVaults = require('../collections/vaults-remote.js').create();
var localVaults = require('../collections/vaults-local.js').create();

v1.get('...', function *() {
  var vault = localVaults.createItem(id);
  yield vault.load();
  vault = remoteVaults.createItem(vault);
});

///////////////////////////////

Vaults
  folders
  files
  url = config.durable.api.url + 'vaults'
  // vaults, vaults/123

Folders
  files
  url = 'folders'
  // vaults/123/folders, vaults/123/folders/abc

Files
  url = 'files'
  // vaults/123/files, vaults/123/files/abc
  // vaults/123/folders/abc/files, vaults/123/folders/abc/files/789

///////////////////////////////

Vaults
  folders
  files
  url = 'vaults'
  // vaults, vaults/123, vaults/123/folders, vaults/123/files

Folders
  files
  url = 'folders'
  // folders, folders/abc, folders/abc/files

Files
  url = 'files'
  // files, files/789
