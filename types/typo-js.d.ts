declare module 'typo-js' {
  export default class Typo {
    constructor(lang: string, affData?: string, wordsData?: string, settings?: object);
    check(word: string): boolean;
    suggest(word: string, limit?: number): string[];
  }
}
