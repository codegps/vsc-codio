import { window, StatusBarItem, StatusBarAlignment, ExtensionContext, MarkdownString } from 'vscode';
import Player from '../player/Player';
import Recorder from '../recorder/Recorder';
import { playerUI, recorderUI } from './popups';

export const showCodioNameInputBox = async (): Promise<string> => {
  return await window.showInputBox({ prompt: 'Give your codio a name:' });
};

export const showChooseAudioDevice = async (items: string[]): Promise<string | undefined> => {
  const audioDevice = await window.showQuickPick(items, { placeHolder: 'Choose an Audio Device to record from' });
  return audioDevice;
};

export const showPlayFromInputBox = async (player: Player): Promise<string> => {
  return await window.showInputBox({
    prompt: `Choose a starting time from 0 to ${player.codioLength / 1000} seconds.`,
  });
};

export const MESSAGES = {
  startingToRecord: 'Starting to record.',
  recordingSaved: 'Recording saved.',
  recordingPaused: 'Recording paused.',
  recordingResumed: 'Recording resumed.',
  recordingCanceled: 'Recording canceled.',
  cantPlayWhileRecording: "Can't play Codio while recording.",
  alreadyPlaying: 'You already have a Codio playing.',
  noActiveCodio: "You don't have an active Codio.",
  noStartTime: 'No start time entered.',
  ffmpegNotAvailable: `Looks like you haven't installed ffmpeg, which is required for Codio to work.
     You can install it with brew: "brew install ffmpeg".`,
  emptyCodioNameInvalid: 'Filename needed to save Codio to.',
  noRecordingDeviceAvailable: 'Codio could not find an audio recording device.',
  noActiveWorkspace: 'You need to have an active workspace to record a Codio.',
};
class UIController {
  shouldDisplayMessages: boolean;
  private statusBar: StatusBarItem;
  private mds: MarkdownString;

  constructor(shouldDisplayMessages) {
    this.shouldDisplayMessages = shouldDisplayMessages;

    this.mds = new MarkdownString('', true);
    this.mds.isTrusted = true;
    this.mds.supportHtml = true;
  }

  /**
   * Create a status bar item to write codio progress to.
   * @param context Context from when the extension was activated.
   */
  createStatusBar(context: ExtensionContext): void {
    if (this.statusBar) {
      this.statusBar.dispose();
    }

    this.statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 101);
    context.subscriptions.push(this.statusBar);
  }

  showMessage(message): void {
    if (this.shouldDisplayMessages) {
      window.showInformationMessage(message);
    }
  }

  /**
   * Show given message as an error pop-up.
   * @param message Message to show in error pop-up.
   */
  showError(message): void {
    window.showErrorMessage(message);
  }

  /**
   * Show codio player progress on status bar item.
   * @param player Player to get updates from.
   */
  showPlayerStatusBar(player: Player): void {
    this.mds.value = playerUI(player.codioName);
    this.statusBar.tooltip = this.mds;

    this.statusBar.name = 'Codio Player';
    this.statusBar.text = '$(megaphone) Playing...';
    this.statusBar.show();

    player.onTimerUpdate((currentTime, totalTime) => {
      const percentage = (currentTime / totalTime) * 100;
      this.statusBar.text = `$(megaphone) Codio $(mention)${Math.round(percentage)}% - ${Math.round(
        currentTime,
      )}s/${Math.round(totalTime)}s`;
    });

    player.process.then(() => {
      this.clearStatusBar();
      this.statusBar.hide();
    });
  }

  /**
   * Show codio recorder progress on status bar item.
   * @param recorder Recorder to get updatess from.
   */
  showRecorderStatusBar(recorder: Recorder): void {
    this.mds.value = recorderUI(recorder.codioName);
    this.statusBar.tooltip = this.mds;

    this.statusBar.name = 'Codio Recorder';
    this.statusBar.text = '$(pulse) Recording...';
    this.statusBar.show();

    recorder.onTimerUpdate(async (currentTime) => {
      this.statusBar.text = `$(pulse) Recording Codio $(mention) ${Math.round(currentTime)}s`;
    });

    recorder.process.then(() => {
      this.clearStatusBar();
      this.statusBar.hide();
    });
  }

  /**
   * Clear data from statusBar member.
   */
  private clearStatusBar(): void {
    this.statusBar.command = '';
    this.statusBar.tooltip = '';
    this.statusBar.text = '';
  }
}

export const UI = new UIController(false);
