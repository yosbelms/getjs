var Jasmine = require('jasmine');
var jasmine = new Jasmine();

global.get  = require('../get.js');

get.copy({

    isBreakpoint: function(obj) {
        return obj && obj instanceof get.Breakpoint;
    },

    isFunction: function(obj) {
        return typeof obj === 'function';
    },

    isPromise: function(obj) {
        return obj && isFunction(obj.then);
    },

}, global);

get.throws(true);

// promise mock
if (!isFunction(global.Promise)) {
    Promise = function() { }
    Promise.prototype.then = function() { }
}

jasmine.configureDefaultReporter({
    showColors: false
})

jasmine.loadConfig({
    spec_dir   : 'test',
    spec_files : [
        'get.js',
        'filter.js',
        'listen.js',
        'drive.js',
        'process.js',
        'channel.js',
        'utility_api.js',
    ]
});

jasmine.execute();