var chp = require('child_process');
[
    'aryn_unbuffered.js',
    'csp_unbuffered.js',

    'aryn_buffered.js',
    'csp_buffered.js',

    'aryn_collaboration.js',
    'csp_collaboration.js',

].forEach(function(s) {
    chp.fork(s);
})