import { parseExpense } from '../src/telegram.module';
import { savingsRate, sum } from '../src/analytics.module';
describe('pure domain functions',()=>{it('parses deterministic expenses',()=>expect(parseExpense('25000 benzine')).toEqual({amount:25000,description:'benzine',type:'expense'}));it('rejects missing descriptions',()=>expect(()=>parseExpense('25000')).toThrow());it('calculates money metrics as integers',()=>{expect(sum([1,2,3])).toBe(6);expect(savingsRate(10000,2500)).toBe(75);});});
