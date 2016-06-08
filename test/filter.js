describe('filter function:', function() {

    it('if undefined is given the resulting filter returns arguments as array', function() {
        var f = get.filter();
        expect(f(1, 2)).toEqual([1, 2])
    })

    it('if function is given the resulting filter is the same function', function() {
        var fn = function(){ };
        var f  = get.filter(fn);
        expect(f).toBe(fn)
    })

    it('if number (X) is given the resulting filter returns argument number X', function() {
        var f = get.filter(1);
        expect(f(1, 2)).toBe(2)
    })

    it('if array is given the resulting filter will use the array values to extract values from a filtered object', function() {
        var f = get.filter(['name', 'age']);
        expect(f({name: 'john', age: 30})).toEqual({name: 'john', age: 30})
    })

})