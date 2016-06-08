
describe('Processes', function() {

    it('should pass the returned value to the done function', function(done) {
        get.go(function*() {
            return 2
        }).done(function(r) {
            expect(r).toBe(2)
            done()
        })
    })

    it('should pass the error to done function', function(done) {
        get.throws(false)

        get.go(function*() {
            throw 'Error!'
        }).done(function(r, err) {
            expect(err).toBe('Error!')
            done()

            // set the throws flag to the previous state
            get.throws(true)
        })
    })


    it('should receive returned values from other processes', function(done) {
        var proc = get(function*(num){
            return num + 5
        })

        get(function*() {
            expect(yield get(proc(5))).toBe(10)
            done()
        })()
    })

})