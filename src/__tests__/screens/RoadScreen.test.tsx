import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { RoadScreen } from '@screens/RoadScreen';
import { PlayerAction } from '@engine/types';
import { TurnEngine } from '@engine/TurnEngine';
import { makeGameState } from '../__fixtures__/gameState';

jest.mock('@components', () => {
  const actual = jest.requireActual('@components');

  return {
    ...actual,
    CompanionDetailModal: () => null,
  };
});

describe('RoadScreen', () => {
  it('submits move actions immediately when the party has no food', async () => {
    const onToast = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 27,
      resources: { food: 0, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const submitAction = jest.spyOn(engine, 'submitAction').mockResolvedValue(undefined);

    const { UNSAFE_getAllByType } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
      />
    );

    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);

    const moveButton = await waitFor(() => {
      const button = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
        candidate.findAllByType(Text).some((textNode: { props: { children: unknown } }) => {
          const children = textNode.props.children;
          return children === 'Move'
            || (Array.isArray(children) && children.includes('Move'));
        })
      );

      expect(button).toBeDefined();
      expect(button?.props.disabled).toBe(false);
      return button!;
    });

    fireEvent.press(moveButton);

    await waitFor(() => {
      expect(submitAction).toHaveBeenCalledWith({ action: PlayerAction.Move, forcedMarch: false });
    });
    expect(onToast).toHaveBeenCalledWith(
      'Marching hungry — health and morale penalties will keep worsening until you find food.'
    );
  });
});
