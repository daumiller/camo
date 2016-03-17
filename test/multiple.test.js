"use strict";

var _ = require('lodash');
var fs = require('fs');
var expect = require('chai').expect;
var connect = require('../index').connect;
var Document = require('../index').Document;
var validateId = require('./util').validateId;

describe('MultipleConnections', function() {

    var url = 'nedb://memory';
    var db1 = null, db2 = null;

    before(function(done) {
        connect(url).then((db) => { db1 = db; return db1.dropDatabase(); }).then(() => { return done(); });
        connect(url).then((db) => { db2 = db; return db2.dropDatabase(); }).then(() => { return done(); });
    });

    beforeEach(function(done) {
        done();
    });

    afterEach(function(done) {
        db1.dropDatabase().then(function() {}).then(done, done);
        db2.dropDatabase().then(function() {}).then(done, done);
    });

    after(function(done) {
        done();
    }); 

    describe('exclusion', function() {
        it('should allow multiple, exclusive, connections', function(done) {
            class TestDoc extends Document {
                constructor(DB) {
                    super(DB);
                    this.name = String;
                }
            }

            var test1 = TestDoc.create(db1, { name: 'Test Item #1' });
            var test2 = TestDoc.create(db2, { name: 'Test Item Two' });

            Promise.all([ test1.save(), test2.save() ]).then(() => {
                Promise.all([
                    TestDoc.find(db1, { name: 'Test Item #1'  }).then((result) => { expect(result.length).to.be.equal(1); }),
                    TestDoc.find(db1, { name: 'Test Item Two' }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db2, { name: 'Test Item #1'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db2, { name: 'Test Item Two' }).then((result) => { expect(result.length).to.be.equal(1); }),
                    TestDoc.count(db1).then((count) => { expect(count).to.be.equal(1); }),
                    TestDoc.count(db2).then((count) => { expect(count).to.be.equal(1); }),
                ]).then(() => { done(); } ).catch((e) => { done(e); });
            });
        });
    });
});
