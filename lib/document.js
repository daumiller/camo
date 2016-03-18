"use strict";

var _ = require('lodash');
var deprecate = require('depd')('camo');
var BaseDocument = require('./base-document');
var isSupportedType = require('./validate').isSupportedType;
var isArray = require('./validate').isArray;
var isReferenceable = require('./validate').isReferenceable;
var isEmbeddedDocument = require('./validate').isEmbeddedDocument;
var isString = require('./validate').isString;
var CamoError = require('./errors').CamoError;

function checkParamDB(db, where) {
    try { if(!db.nativeIdType) { throw new Error('missing member'); } }
    catch(e) { throw new CamoError('Missing database parameter to ' + where); }
}

class Document extends BaseDocument {
	constructor(DB) {
        super(DB);
    }

    // TODO: Is there a way to tell if a class is
    // a subclass of something? Until I find out
    // how, we'll be lazy use this.
    static documentClass() {
        return 'document';
    }

    documentClass() {
        return 'document';
    }

    get meta() {
        return this._meta;
    }

    set meta(meta) {
        this._meta = meta;
    }

    save() {
        var that = this;

        var preValidatePromises = this._getHookPromises('preValidate');

        return Promise.all(preValidatePromises).then(function() {

            // Ensure we at least have defaults set

            // TODO: We already do this on .create(), so
            // should it really be done again?
            _.keys(that._schema).forEach(function(key) {
                if (!(key in that._schema)) {
                    that[key] = that.getDefault(key);
                }
            });

            // Validate the assigned type, choices, and min/max
            that.validate();

            // Ensure all data types are saved in the same encodings
            that.canonicalize();

            // TODO: We should instead track what has changed and
            // only update those values. Maybe make that._changed
            // object to do this.
            // Also, this might be really slow for objects with
            // lots of references. Figure out a better way.
            var toUpdate = that._toData({_id: false});

            // Reference our objects
            _.keys(that._schema).forEach(function(key) {
                // Never care about _id
                if (key === '_id') return;

                if (isReferenceable(that._camoDB, that[key]) ||   // isReferenceable OR
                    (isArray(that[key]) &&                        // isArray AND contains value AND value isReferenceable
                    that[key].length > 0 &&
                    isReferenceable(that._camoDB, that[key][0]))) {

                    // Handle array of references (ex: { type: [MyObject] })
                    if (isArray(that[key])) {
                        toUpdate[key] = [];
                        that[key].forEach(function(v) {
                            if (that._camoDB.isNativeId(v)) {
                                toUpdate[key].push(v);
                            } else {
                                toUpdate[key].push(v._id);
                            }
                        });
                    } else {
                        if (that._camoDB.isNativeId(that[key])) {
                            toUpdate[key] = that[key];
                        } else {
                            toUpdate[key] = that[key]._id;
                        }
                    }

                }
            });

            // Replace EmbeddedDocument references with just their data
            _.keys(that._schema).forEach(function(key) {
                if (isEmbeddedDocument(that[key]) ||               // isEmbeddedDocument OR
                    (isArray(that[key]) &&              // isArray AND contains value AND value isEmbeddedDocument
                    that[key].length > 0 &&
                    isEmbeddedDocument(that[key][0]))) {

                    // Handle array of references (ex: { type: [MyObject] })
                    if (isArray(that[key])) {
                        toUpdate[key] = [];
                        that[key].forEach(function(v) {
                            toUpdate[key].push(v._toData());
                        });
                    } else {
                        toUpdate[key] = that[key]._toData();
                    }

                }
            });

            return toUpdate;
        }).then(function(data) {
            // TODO: hack?
            var postValidatePromises = [data].concat(that._getHookPromises('postValidate'));
            return Promise.all(postValidatePromises);
        }).then(function(prevData) {
            var data = prevData[0];
            // TODO: hack?
            var preSavePromises = [data].concat(that._getHookPromises('preSave'));
            return Promise.all(preSavePromises);
        }).then(function(prevData) {
            var data = prevData[0];
            return that._camoDB.save(that.collectionName(), that._id, data);
        }).then(function(id) {
            if (that._id === null) {
                that._id = id;
            }
        }).then(function() {
            // TODO: hack?
            var postSavePromises = that._getHookPromises('postSave');
            return Promise.all(postSavePromises);
        }).then(function() {
            return that;
        }).catch(function(error) {
            return Promise.reject(error);
        });
    }

    delete() {
        var that = this;
        
        var preDeletePromises = that._getHookPromises('preDelete');

        return Promise.all(preDeletePromises).then(function() {
            return that._camoDB.delete(that.collectionName(), that._id);
        }).then(function(deleteReturn) {
            // TODO: hack?
            var postDeletePromises = [deleteReturn].concat(that._getHookPromises('postDelete'));
            return Promise.all(postDeletePromises);
        }).then(function(prevData) {
            var deleteReturn = prevData[0];
            return deleteReturn;
        });
    }

    static deleteOne(DB, query) {
        checkParamDB(DB, this.name + '.deleteOne');
        return DB.deleteOne(this.collectionName(), query);
    }

    static deleteMany(DB, query) {
        checkParamDB(DB, this.name + '.deleteMany');
        if (query === undefined || query === null) {
            query = {};
        }
        
        return DB.deleteMany(this.collectionName(), query);
    }

    // TODO: Need options to specify whether references should be loaded
    static findOne(DB, query, options) {
        checkParamDB(DB, this.name + '.findOne');
        var that = this;

        var populate = true;
        if (options && options.hasOwnProperty('populate')) {
            populate = options.populate;
        }

        return DB.findOne(this.collectionName(), query)
        .then(function(data) {
            if (!data) {
                return null;
            }

            var doc = that._fromData(DB, data);
            if (populate === true || (isArray(populate) && populate.length > 0)) {
                return that.populate(DB, doc, populate);
            }

            console.log('2b: ' + doc);
            return doc;
        }).then(function(docs) {
            if (docs) {
                return docs;
            }
            return null;
        });
    }

    static findOneAndUpdate(DB, query, values, options) {
        checkParamDB(DB, this.name + '.findOneAndUpdate');
        var that = this;

        if (arguments.length < 3) {
            throw new Error('findOneAndUpdate requires at least 3 arguments. Got ' + arguments.length + '.');
        }

        if (!options) {
            options = {};
        }

        var populate = true;
        if (options.hasOwnProperty('populate')) {
            populate = options.populate;
        }

        return DB.findOneAndUpdate(this.collectionName(), query, values, options)
        .then(function(data) {
            if (!data) {
                return null;
            }

            var doc = that._fromData(DB, data);
            if (populate) {
                return that.populate(DB, doc);
            }

            return doc;
        }).then(function(doc) {
            if (doc) {
                return doc;
            }
            return null;
        });
    }

    static findOneAndDelete(DB, query, options) {
        checkParamDB(DB, this.name + '.findOneAndDelete');
        var that = this;

        if (arguments.length < 1) {
            throw new Error('findOneAndDelete requires at least 1 argument. Got ' + arguments.length + '.');
        }

        if (!options) {
            options = {};
        }

        return DB.findOneAndDelete(this.collectionName(), query, options);
    }

    // TODO: Need options to specify whether references should be loaded
    static find(DB, query, options) {
        checkParamDB(DB, this.name + '.find');
        var that = this;

        if (query === undefined || query === null) {
            query = {};
        }

        if (options === undefined || options === null) {
            // Populate by default
            options = {populate: true};
        }

        return DB.find(this.collectionName(), query, options)
        .then(function(datas) {
            var docs = that._fromData(DB, datas);

            if (options.populate === true || 
                (isArray(options.populate) && options.populate.length > 0)) {
                return that.populate(DB, docs, options.populate);
            }

            return docs;
        }).then(function(docs) {
            // Ensure we always return an array
            return [].concat(docs);
        });
    }

    static count(DB, query) {
        checkParamDB(DB, this.name + '.count');
        var that = this;
        return DB.count(this.collectionName(), query);
    }

    static createIndexes(DB) {
        checkParamDB(DB, this.name + '.createIndexes');
        if (this._indexesCreated) {
            return;
        }

        var that = this;
        var instance = this._instantiate(DB);

        _.keys(instance._schema).forEach(function(k) {
            if (instance._schema[k].unique) {
                DB.createIndex(that.collectionName(), k, {unique: true});
            }
        });

        this._indexesCreated = true;
    }

    static _fromData(DB, datas) {
        var instances = super._fromData(DB, datas);
        // This way we preserve the original structure of the data. Data
        // that was passed as an array is returned as an array, and data
        // passes as a single object is returned as single object
        var datasArray = [].concat(datas);
        var instancesArray = [].concat(instances);

        /*for (var i = 0; i < instancesArray.length; i++) {
            if (datasArray[i].hasOwnProperty('_id')) {
                instancesArray[i]._id = datasArray[i]._id;
            } else {
                instancesArray[i]._id = null;
            }
        }*/
        
        return instances;
    }

    static clearCollection(DB) {
        checkParamDB(DB, this.name + '.clearCollection');
        return DB.clearCollection(this.collectionName());
    }
    
}

module.exports = Document;
