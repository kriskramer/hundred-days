import { act, render, screen } from '@testing-library/react-native';
import { TypewriterText } from '@components/TypewriterText';

describe('TypewriterText', () => {
  it('continues typing when new text appends to the existing text', () => {
    jest.useFakeTimers();

    const onComplete = jest.fn();
    const { rerender } = render(
      <TypewriterText text="Hello" interval={10} onComplete={onComplete} />
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByText('Hello')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);

    rerender(
      <TypewriterText text="Hello there" interval={10} onComplete={onComplete} />
    );

    expect(screen.getByText('Hello')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10);
    });

    expect(screen.getByText('Hello ')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(60);
    });

    expect(screen.getByText('Hello there')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
