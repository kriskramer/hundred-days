import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { RoadScreen } from '@screens/RoadScreen';
import { PlayerAction, WeatherType } from '@engine/types';
import { TurnEngine } from '@engine/TurnEngine';
import { makeGameState } from '../__fixtures__/gameState';
import { getShopEntryNarrative } from '@utils/tradeJournal';

jest.mock('@components', () => {
  const actual = jest.requireActual('@components');

  return {
    ...actual,
    CompanionDetailModal: () => null,
  };
});

jest.mock('@engine/EventSystem', () => {
  const actual = jest.requireActual('@engine/EventSystem');

  return {
    ...actual,
    hasEligibleDialogue: jest.fn(() => true),
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

  it('triggers the Next action and goes to the location view when tapping the screen on the journal entry display', async () => {
    const onToast = jest.fn();
    const gameState1 = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);

    const { rerender, UNSAFE_getAllByType, queryByText } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
      />
    );

    // At first, journal should not be showing
    expect(queryByText('LAST ENTRY — DAY 1')).toBeNull();

    // Now simulate taking an action by updating the state prop
    const gameState2 = {
      ...gameState1,
      turnHistory: [
        {
          dayNumber: 1,
          locationBefore: 26,
          locationAfter: 27,
          action: PlayerAction.Move,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [],
          levelUpOccurred: false,
          narrativeSummary: 'Marched along the path.',
        },
      ],
    };

    rerender(
      <RoadScreen
        gameState={gameState2}
        engine={engine}
        onToast={onToast}
      />
    );

    // Now the journal entry text should be visible
    expect(queryByText('LAST ENTRY — DAY 1')).toBeTruthy();
    expect(queryByText('⚔ DANGER')).toBeNull();
    expect(queryByText('◇ STRANGER NEARBY')).toBeNull();
    // And Next button should NOT exist
    expect(queryByText('NEXT')).toBeNull();

    // The full-screen overlay should be present
    const overlay = UNSAFE_getAllByType(TouchableOpacity).find(c =>
      c.props.style && c.props.style.position === 'absolute'
    );
    expect(overlay).toBeDefined();
    fireEvent.press(overlay!);

    // Tapping it should turn showingLastEntry to false, and the main location view actions should show
    await waitFor(() => {
      expect(queryByText('LAST ENTRY — DAY 1')).toBeNull();
    });
    expect(queryByText('⚔ DANGER')).toBeTruthy();
    expect(queryByText('◇ STRANGER NEARBY')).toBeTruthy();
  });

  it('types the shop entry line before opening the shop', async () => {
    jest.useFakeTimers();

    const onToast = jest.fn();
    const onOpenShop = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const { UNSAFE_getAllByType } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        onOpenShop={onOpenShop}
        textInterval={1}
      />
    );

    const initialOverlay = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
      candidate.props.style && candidate.props.style.position === 'absolute'
    );
    expect(initialOverlay).toBeDefined();

    fireEvent.press(initialOverlay!);

    const tradeButton = await waitFor(() => {
      const button = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
        candidate.findAllByType(Text).some((textNode: { props: { children: unknown } }) => {
          const children = textNode.props.children;
          return children === 'Trade'
            || (Array.isArray(children) && children.includes('Trade'));
        })
      );

      expect(button).toBeDefined();
      expect(button?.props.disabled).toBe(false);
      return button!;
    });

    fireEvent.press(tradeButton);
    expect(onOpenShop).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(onOpenShop).toHaveBeenCalledWith('The Sdrakam Armory');
    jest.useRealTimers();
  });

  it('does not auto-show the journal overlay for a trade entry', () => {
    const onToast = jest.fn();
    const gameState1 = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);
    const { rerender, queryByText } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    const gameState2 = {
      ...gameState1,
      turnHistory: [
        {
          dayNumber: 1,
          locationBefore: 27,
          locationAfter: 27,
          action: PlayerAction.Trade,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [],
          levelUpOccurred: false,
          narrativeSummary: getShopEntryNarrative('The Sdrakam Armory'),
        },
      ],
    };

    rerender(
      <RoadScreen
        gameState={gameState2}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    expect(queryByText('LAST ENTRY — DAY 1')).toBeNull();
    expect(queryByText('Trade')).toBeTruthy();
  });
});
