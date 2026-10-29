import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCookieHeader } from '../src/lib/supabase.ts';

test('parsea varias cookies ignorando espacios', () => {
  const out = parseCookieHeader('a=1; b=2 ;c=3');
  assert.deepEqual(out, [{ name: 'a', value: '1' }, { name: 'b', value: '2' }, { name: 'c', value: '3' }]);
});

test('no explota con header nulo o vacío (el bug que rompía el middleware)', () => {
  assert.deepEqual(parseCookieHeader(null), []);
  assert.deepEqual(parseCookieHeader(undefined), []);
  assert.deepEqual(parseCookieHeader(''), []);
});

test('decodifica valores con URL encoding', () => {
  const out = parseCookieHeader('sb-token=base64-abc%3D%3D');
  assert.equal(out[0].value, 'base64-abc==');
});

test('un valor mal codificado no rompe el parseo', () => {
  const out = parseCookieHeader('roto=%E0%A4%A; ok=1');
  assert.equal(out.length, 2);
  assert.equal(out[1].value, '1');
});
