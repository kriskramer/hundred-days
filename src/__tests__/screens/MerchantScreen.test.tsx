import { render, fireEvent } from '@testing-library/react-native';
import { MerchantScreen } from '@screens/MerchantScreen';
import { makeGameState } from '../__fixtures__/gameState';
import { useGameStore } from '@store/gameStore';

jest.mock('@hooks/useShopActions', () => ({
  useShopActions: () => ({
    buyItem: jest.fn(),
    sellItem: jest.fn(),
  }),
}));

jest.mock('@components', () => ({
  CompanionDialogueModal: () => null,
  TypewriterText: ({ text }: { text: string }) => {
    const { Text } = require('react-native');
    return <Text>{text}</Text>;
  },
}));

describe('MerchantScreen', () => {
  beforeEach(() => {
    useGameStore.setState({
      gameState: makeGameState({ currentLocationId: 27 }),
    });
  });

  it('renders merchant entry narrative and ROAD back button', () => {
    const onBackToRoad = jest.fn();
    const { getByText } = render(
      <MerchantScreen
        onBackToRoad={onBackToRoad}
        onToast={jest.fn()}
        merchantEntryNarrative="The merchant greets you warmly."
      />
    );

    expect(getByText('The merchant greets you warmly.')).toBeTruthy();
    fireEvent.press(getByText('ROAD'));
    expect(onBackToRoad).toHaveBeenCalled();
  });
});
