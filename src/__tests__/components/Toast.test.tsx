import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Toast } from '@components/Toast';

describe('Toast', () => {
  it('renders nothing when message is empty', () => {
    const { toJSON } = render(<Toast message="" />);
    expect(toJSON()).toBeNull();
  });

  it('renders message text when message is provided', () => {
    render(<Toast message="Saved successfully" />);
    expect(screen.getByText('Saved successfully')).toBeTruthy();
  });

  it('renders gold border container', () => {
    const { UNSAFE_getAllByType } = render(<Toast message="Hello" />);
    const views = UNSAFE_getAllByType(require('react-native').View);
    const toastView = views.find(v => v.props.style?.borderColor === '#B8860B');
    expect(toastView).toBeDefined();
  });
});
