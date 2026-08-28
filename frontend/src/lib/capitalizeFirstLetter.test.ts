import { describe, expect, it } from 'vitest'
import { capitalizeFirstLetter } from './capitalizeFirstLetter'

describe('capitalizeFirstLetter', () => {
  it('capitalizes a lowercase first letter', () => {
    expect(capitalizeFirstLetter('jane')).toBe('Jane')
  })

  it('leaves an already-capitalized first letter alone', () => {
    expect(capitalizeFirstLetter('Jane')).toBe('Jane')
  })

  it('leaves the rest of the string untouched — only index 0 is ever touched', () => {
    expect(capitalizeFirstLetter('mcDONALD')).toBe('McDONALD')
  })

  it('handles an empty string without throwing', () => {
    expect(capitalizeFirstLetter('')).toBe('')
  })

  it('handles a single character', () => {
    expect(capitalizeFirstLetter('j')).toBe('J')
  })

  it('leaves a string starting with a non-letter (e.g. a leading space while typing) alone', () => {
    expect(capitalizeFirstLetter(' jane')).toBe(' jane')
  })
})
