import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DreadBanner } from '@components/DreadBanner';

describe('DreadBanner', () => {
  it('renders nothing when inactive', () => {
    const { toJSON } = render(<DreadBanner active={false} />);
    expect(toJSON()).toBeNull();
  });

  it('renders warning text when active', () => {
    render(<DreadBanner active={true} />);
    expect(screen.getByText(/Dread settles in/)).toBeTruthy();
  });

  it('contains dread message text when active', () => {
    render(<DreadBanner active={true} />);
    expect(screen.getByText(/days are running short/)).toBeTruthy();
  });
});
