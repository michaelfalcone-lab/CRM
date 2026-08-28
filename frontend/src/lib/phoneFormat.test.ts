import { describe, expect, it } from 'vitest'
import {
  digitsOnly,
  formatPhoneDigits,
  formatPhoneInput,
  isValidPhoneDigitCount,
  phoneDigitCount,
} from './phoneFormat'

describe('digitsOnly', () => {
  it('strips every non-digit character', () => {
    expect(digitsOnly('(401) 555-1234')).toBe('4015551234')
  })

  it('returns empty for a string with no digits', () => {
    expect(digitsOnly('abc')).toBe('')
  })
})

describe('formatPhoneDigits', () => {
  it('leaves 1-3 digits unformatted', () => {
    expect(formatPhoneDigits('4')).toBe('4')
    expect(formatPhoneDigits('401')).toBe('401')
  })

  it('inserts one dash after the area code for 4-6 digits', () => {
    expect(formatPhoneDigits('4015')).toBe('401-5')
    expect(formatPhoneDigits('401555')).toBe('401-555')
  })

  it('inserts both dashes for 7-10 digits', () => {
    expect(formatPhoneDigits('4015551')).toBe('401-555-1')
    expect(formatPhoneDigits('4015551234')).toBe('401-555-1234')
  })

  it('drops digits past the 10th rather than wrapping them into a new group', () => {
    expect(formatPhoneDigits('40155512345')).toBe('401-555-1234')
  })

  it('returns empty for empty input', () => {
    expect(formatPhoneDigits('')).toBe('')
  })
})

describe('formatPhoneInput', () => {
  it('formats raw, unformatted typed input directly', () => {
    expect(formatPhoneInput('4015551234')).toBe('401-555-1234')
  })

  it('re-derives from digits rather than trusting existing dashes, so edits mid-string still produce a correct result', () => {
    // Simulates a user deleting a character out of the middle of an
    // already-formatted value — the raw string passed in is whatever the
    // input's value is at that moment, dashes and all.
    expect(formatPhoneInput('401-55-1234')).toBe('401-551-234')
  })

  it('ignores pasted non-digit characters entirely', () => {
    expect(formatPhoneInput('(401) 555-1234 ext')).toBe('401-555-1234')
  })
})

describe('phoneDigitCount / isValidPhoneDigitCount', () => {
  it('counts only real digits, ignoring the formatting dashes', () => {
    expect(phoneDigitCount('401-555-1234')).toBe(10)
  })

  it('treats undefined the same as empty', () => {
    expect(phoneDigitCount(undefined)).toBe(0)
  })

  it('accepts empty as valid — phone is optional at the field level', () => {
    expect(isValidPhoneDigitCount('')).toBe(true)
    expect(isValidPhoneDigitCount(undefined)).toBe(true)
  })

  it('rejects a partial count — an area code alone must not pass', () => {
    // '401-' alone: 3 digits, no real local number typed yet.
    expect(isValidPhoneDigitCount('401-')).toBe(false)
  })

  it('accepts exactly 10 digits', () => {
    expect(isValidPhoneDigitCount('401-555-1234')).toBe(true)
  })

  it('rejects 11+ digits', () => {
    expect(isValidPhoneDigitCount('1-401-555-1234')).toBe(false)
  })
})
