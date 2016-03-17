"use strict";

var _ = require('lodash');
var fs = require('fs');
var expect = require('chai').expect;
var connect = require('../index').connect;
var Document = require('../index').Document;
var validateId = require('./util').validateId;

describe('MultipleConnections', function() {

    var urlNeMem = 'nedb://memory';
    var urlNeFil = 'nedb://test/nedbdata/multiple';
    var urlMongo = 'mongodb://localhost/camo_test';
    var db1 = null, db2 = null, db3 = null, db4 = null;

    before(function(done) {
        Promise.all([
            connect(urlNeMem).then((db) => { db1 = db; return db1.dropDatabase(); }),
            connect(urlNeMem).then((db) => { db2 = db; return db2.dropDatabase(); }),
            connect(urlNeFil).then((db) => { db3 = db; return db3.dropDatabase(); }),
            connect(urlMongo).then((db) => { db4 = db; return db4.dropDatabase(); }),
        ]).then(() => { return done(); });
    });

    beforeEach(function(done) {
        done();
    });

    afterEach(function(done) {
        Promise.all([
            db1.dropDatabase(),
            db2.dropDatabase(),
            db3.dropDatabase(),
            db4.dropDatabase(),
        ]).then(() => { done(); });
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

            var test1  = TestDoc.create(db1, { name: 'Test Item #1'   });
            var test2  = TestDoc.create(db2, { name: 'Test Item Two'  });
            var test3a = TestDoc.create(db3, { name: 'Test Item 3a'   });
            var test3b = TestDoc.create(db3, { name: 'Test Item 3b'   });
            var test4  = TestDoc.create(db4, { name: 'Test Item Four' });

            Promise.all([ test1.save(), test2.save(), test3a.save(), test3b.save(), test4.save() ]).then(() => {
                Promise.all([
                    TestDoc.count(db1).then((count) => { expect(count).to.be.equal(1); }),
                    TestDoc.count(db2).then((count) => { expect(count).to.be.equal(1); }),
                    TestDoc.count(db3).then((count) => { expect(count).to.be.equal(2); }),
                    TestDoc.count(db4).then((count) => { expect(count).to.be.equal(1); }),

                    TestDoc.find(db1, { name: 'Test Item #1'  }).then((result) => { expect(result.length).to.be.equal(1); }),
                    TestDoc.find(db1, { name: 'Test Item Two' }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db1, { name: 'Test Item 3a'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db1, { name: 'Test Item 3b'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db1, { name: 'Test Item Four'}).then((result) => { expect(result.length).to.be.equal(0); }),

                    TestDoc.find(db2, { name: 'Test Item #1'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db2, { name: 'Test Item Two' }).then((result) => { expect(result.length).to.be.equal(1); }),
                    TestDoc.find(db2, { name: 'Test Item 3a'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db2, { name: 'Test Item 3b'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db2, { name: 'Test Item Four'}).then((result) => { expect(result.length).to.be.equal(0); }),

                    TestDoc.find(db3, { name: 'Test Item #1'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db3, { name: 'Test Item Two' }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db3, { name: 'Test Item 3a'  }).then((result) => { expect(result.length).to.be.equal(1); }),
                    TestDoc.find(db3, { name: 'Test Item 3b'  }).then((result) => { expect(result.length).to.be.equal(1); }),
                    TestDoc.find(db3, { name: 'Test Item Four'}).then((result) => { expect(result.length).to.be.equal(0); }),

                    TestDoc.find(db4, { name: 'Test Item #1'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db4, { name: 'Test Item Two' }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db4, { name: 'Test Item 3a'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db4, { name: 'Test Item 3b'  }).then((result) => { expect(result.length).to.be.equal(0); }),
                    TestDoc.find(db4, { name: 'Test Item Four'}).then((result) => { expect(result.length).to.be.equal(1); }),
                ]).then(() => { done(); } ).catch((e) => { done(e); });
            });
        });
    });
});
