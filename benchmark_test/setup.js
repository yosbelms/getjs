var buff = Buffer(10*1024); // Kb
buff.fill('0');

var bigBuff = Buffer(10000*1024); // Kb
bigBuff.fill('0');

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