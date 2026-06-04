export function mockRandomSequence(...values: number[]): jest.SpyInstance {
  const queue = [...values];
  return jest.spyOn(Math, 'random').mockImplementation(() => {
    const v = queue.shift();
    if (v === undefined) {
      throw new Error(
        `Math.random called more times than expected (provided ${values.length} values)`
      );
    }
    return v;
  });
}

export function mockRandomValue(value: number): jest.SpyInstance {
  return jest.spyOn(Math, 'random').mockReturnValue(value);
}
