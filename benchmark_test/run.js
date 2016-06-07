var chp = require('child_process');
[
    'getjs_unbuffered.js',
    'csp_unbuffered.js',

    'getjs_buffered.js',
    'csp_buffered.js',

    'getjs_collaboration.js',
    'csp_collaboration.js',

].forEach(function(s) {
    chp.fork(s);
})