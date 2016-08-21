var Jasmine = require('jasmine');
var jasmine = new Jasmine();

global.get  = require('../get.js');

global.isFunction = function(obj) {
    return typeof obj === 'function';
}

global.isPromise = function(obj) {
    return obj && isFunction(obj.then);
}

jasmine.configureDefaultReporter({
    showColors: false
})

jasmine.loadConfig({
    spec_dir   : 'test',
    spec_files : [
        'get.js',
        'go.js',
        'promisify.js',
        'coroutines.js',
        'channel.js',
        'all.js',
        'race.js',
    ]
});

jasmine.execute();