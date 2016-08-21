
describe('get.race', function() {

    var five = get.wrap(function*() {
        yield get.timeout(5)
        return 5
    })

    var ten = get.wrap(function*() {
        yield get.timeout(10)
        return 10
    })

    it('should resolve with the first of the array of promises to be resolved', function(done) {
        var race = get.race([five(), ten()])

        race.then(function(value) {
            expect(value.which).toBe(0)
            expect(value.value).toBe(5)
            done()
        })
    })


    it('should resolve with the first of the object with promises to be resolved', function(done) {
        var race = get.race({
            five : five(),
            ten  : ten()
        })

        race.then(function(value) {
            expect(value.which).toBe('five')
            expect(value.value).toBe(5)
            done()
        })
    })
})