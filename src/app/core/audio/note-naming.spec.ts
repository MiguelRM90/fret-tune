import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeNote, formatNote } from './note-naming';

describe('note-naming', () => {
  it('names notes with letters by default', () => {
    assert.equal(formatNote(40, 'letter'), 'E2');
    assert.equal(formatNote(69, 'letter'), 'A4');
    assert.equal(formatNote(61, 'letter'), 'C♯4');
  });

  it('names notes with solfège', () => {
    assert.equal(formatNote(40, 'solfege'), 'Mi2');
    assert.equal(formatNote(67, 'solfege'), 'Sol4');
    assert.equal(formatNote(70, 'solfege'), 'La♯4');
  });

  it('omits the octave on request', () => {
    assert.equal(formatNote(64, 'letter', false), 'E');
  });

  it('describes note parts', () => {
    assert.deepEqual(describeNote(23, 'letter'), { midi: 23, name: 'B', accidental: '', octave: 0 });
    assert.deepEqual(describeNote(54, 'letter'), { midi: 54, name: 'F', accidental: '♯', octave: 3 });
  });
});

