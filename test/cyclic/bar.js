"use strict";

var Document = require('../../index').Document;
//var Foo = require('./foo');

class Bar extends Document {
	constructor(DB) {
		super(DB);

		this.foo = require('./foo');
		this.num = Number;
	}
}

module.exports = Bar;
