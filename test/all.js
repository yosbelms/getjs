
describe('get.all', function() {

    var five = get.wrap(function*() {
        yield get.timeout(5)
        return 5
    })

    var ten = get.wrap(function*() {
        yield get.timeout(10)
        return 10
    })

    it('should wait for the whole array of promises to be resolved', function(done) {
        var all = get.all([five(), ten()])

        all.then(function(value) {
            expect(value[0]).toBe(5)
            expect(value[1]).toBe(10)
            done()
        })
    })


    it('should wait for the whole object with promises to be resolved', function(done) {
        var all = get.all({
            five : five(),
            ten  : ten()
        })

        all.then(function(value) {
            expect(value.five).toBe(5)
            expect(value.ten).toBe(10)
            done()
        })
    })
})