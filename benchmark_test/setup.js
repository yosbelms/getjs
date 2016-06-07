function makeBuffer(size) {
    var buff = new Array(size), i;
    for (i = 0; i < size; i++) {
        buff[i] = '0';
    }
    return buff;
}

var buff    = makeBuffer(100*1024); // Kb
var bigBuff = makeBuffer(10000*1024); // Kb

function time() {
    return (new Date()).getTime()
}


/**
receives a channel and begins to repeatedly execute a function using "setTimeout"
once the channel closes it calculates the "collab factor" which is

collab_faactor = hits / total_execution_time

collaboration factor determines how many hits are in 1 second.
the result is printed to stdout
*/
function collaborationTest(ch, libName) {
    var
    secs, collab,
    hits      = 0,
    startTime = time();

    function intent() {
        if (!ch.closed) {
            setTimeout(function(){ hits++, intent() }, 0)
        } else {
            secs   = (time() - startTime)/1000;
            collab = hits / secs;
            console.log(libName, 'collaboration:', Math.floor(collab));
        }
    }
    intent()
};

exports.time = time;
exports.buffer = buff;
exports.bigBuffer = bigBuff;
exports.collaborationTest = collaborationTest;