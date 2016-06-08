
describe('drive function', function() {

    var ModuleMock = {
        name    : 'fs',
        asyncFn : function(callback) { callback(this.name) },
        fnSync  : function() { }
    }

    var mod = get.drive(ModuleMock);

    it('should drive all functions in a object', function() {
        var b = mod.asyncFn();
        expect(isBreakpoint(b)).toBe(true)
    })

    it('should not drive functions with `Sync` suffix', function() {
        expect(mod.fnSync).toBeUndefined()
    })

    it('should work with passing a function', function() {
        var fn = get.drive(ModuleMock.asyncFn);
        expect(isFunction(fn)).toBe(true)
    })

    it('should drive functions only once', function() {
        var
        name,
        asyncFn = mod.asyncFn,

        // try to set a different scope
        tmod = get.drive(ModuleMock, {name: 'net'});

        mod.asyncFn(function(n){ name = n })

        expect(name).toBe('fs')
        expect(asyncFn).toBe(tmod.asyncFn)
    })

})