
describe('promisify function', function() {

    var ModuleMock = {
        name    : 'fs',
        asyncFn : function(callback) { callback(this.name) },
        fnSync  : function() { }
    }

    var mod = get.promisify(ModuleMock);

    it('should promisify all functions in a object', function() {
        var p = mod.asyncFn();
        expect(isPromise(p)).toBe(true)
    })

    it('should not promisify functions with `Sync` suffix', function() {
        expect(mod.fnSync).toBeUndefined()
    })

    it('should work with passing a function', function() {
        var fn = get.promisify(ModuleMock.asyncFn);
        expect(isFunction(fn)).toBe(true)
    })

    it('should promisify functions only once', function() {
        var
        name,
        asyncFn = mod.asyncFn,

        // try to setup whith a different scope
        tmod = get.promisify(ModuleMock, {name: 'net'});

        mod.asyncFn(function(n){ name = n })

        expect(name).toBe('fs')
        expect(asyncFn).toBe(tmod.asyncFn)
    })

})