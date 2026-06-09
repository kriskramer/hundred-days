import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TitleScreen from '../../../app/index';

jest.mock('@engine/SaveEngine', () => ({
  saveEngine: {
    getActiveSaveInfo: jest.fn().mockResolvedValue(null),
    getRunHistory: jest.fn().mockResolvedValue([]),
    clearActiveRun: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@components', () => ({
  SettingsModal: () => null,
}));

describe('TitleScreen', () => {
  it('renders BEGIN THE JOURNEY, LEADERBOARD, and PROFILE buttons', async () => {
    const { getByText } = render(<TitleScreen />);

    await waitFor(() => {
      expect(getByText('BEGIN THE JOURNEY')).toBeTruthy();
      expect(getByText('LEADERBOARD')).toBeTruthy();
      expect(getByText('PROFILE')).toBeTruthy();
    });
  });
});
