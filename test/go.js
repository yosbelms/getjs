
describe('get.go', function() {
    var promise;

    it('returns a promise', function() {
        promise = get.go(function*(){})
        expect(isPromise(promise)).toBe(true)
    })
})