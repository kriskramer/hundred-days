import { render, fireEvent } from '@testing-library/react-native';
import { InnScreen } from '@screens/InnScreen';
import { makeGameState } from '../__fixtures__/gameState';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerAction } from '@engine/types';

describe('InnScreen', () => {
  it('shows rest and tavern talk actions at a town', () => {
    const gameState = makeGameState({ currentLocationId: 27 });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const submitAction = jest.spyOn(engine, 'submitAction').mockResolvedValue(undefined);

    const { getByText } = render(
      <InnScreen
        gameState={gameState}
        engine={engine}
        activeEvent={null}
        onBackToRoad={jest.fn()}
        onRestComplete={jest.fn()}
        onTavernComplete={jest.fn()}
        onToast={jest.fn()}
      />
    );

    expect(getByText('REST')).toBeTruthy();
    expect(getByText('TAVERN TALK')).toBeTruthy();

    fireEvent.press(getByText('REST'));
    expect(submitAction).toHaveBeenCalledWith({ action: PlayerAction.Rest, atInn: true });
  });

  it('returns to road from ROAD button without spending a turn', () => {
    const gameState = makeGameState({ currentLocationId: 27 });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const onBackToRoad = jest.fn();

    const { getByText } = render(
      <InnScreen
        gameState={gameState}
        engine={engine}
        activeEvent={null}
        onBackToRoad={onBackToRoad}
        onRestComplete={jest.fn()}
        onTavernComplete={jest.fn()}
        onToast={jest.fn()}
      />
    );

    fireEvent.press(getByText('ROAD'));
    expect(onBackToRoad).toHaveBeenCalled();
  });
});
