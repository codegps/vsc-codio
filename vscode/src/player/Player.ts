import EditorPlayer from './Editor';
import Timer from '../ProgressTimer';
import FSManager from '../filesystem/FSManager';
import { commands, Disposable, TextEditorSelectionChangeEvent, window } from 'vscode';
import AudioHandler from '../audio/Audio';
import Subtitles from './Subtitles';
import Environment from '../environment/Environment';

const IS_PLAYING = 'isPlaying';
const IN_CODIO_SESSION = 'inCodioSession';

export default class Player {
  isPlaying = false;
  codioPath: string;

  codioLength: number;
  codioStartTime: number;
  relativeActiveTime = 0;
  lastStoppedTime = 0;

  editorPlayer: EditorPlayer;
  audioPlayer: AudioHandler;
  subtitlesPlayer: Subtitles;
  timer: Timer;

  closeCodioResolver: (value?: unknown) => void;
  process: Promise<unknown>;
  onPauseHandler: Disposable;

  /**
   * Create all media needed for the codio.
   * @param codioPath Path where codio was unzipped to access files.
   * @param workspaceToPlayOn Path of the current workspace.
   */
  async loadCodio(codioPath: string, workspaceToPlayOn?: string): Promise<void> {
    try {
      this.setInitialState();
      this.codioPath = codioPath;
      const timeline = await FSManager.loadTimeline(this.codioPath);
      this.codioLength = timeline.codioLength;

      this.editorPlayer = new EditorPlayer();
      let loaded = this.editorPlayer.load(
        workspaceToPlayOn ? workspaceToPlayOn : FSManager.workspacePath(this.codioPath),
        timeline,
      );
      if (!loaded) {
        this.editorPlayer.destroy();
      }

      this.audioPlayer = new AudioHandler(FSManager.audioPath(this.codioPath), Environment.getInstance());

      this.subtitlesPlayer = new Subtitles();
      loaded = await this.subtitlesPlayer.load(FSManager.subtitlesPath(this.codioPath));
      if (!loaded) {
        this.subtitlesPlayer.destroy();
      }

      this.timer = new Timer(this.codioLength);
      this.timer.onFinish(() => this.stop());
    } catch (e) {
      console.log('loadCodio failed', e);
    }
  }

  setInitialState(): void {
    this.relativeActiveTime = 0;
    this.lastStoppedTime = 0;
    this.codioStartTime = undefined;
    this.codioLength = undefined;
    this.closeCodioResolver = undefined;
    this.process = undefined;
  }

  async startCodio(): Promise<void> {
    this.process = new Promise((resolve) => (this.closeCodioResolver = resolve));
    await this.editorPlayer.moveToFrame(0);
    this.play(this.editorPlayer.events, this.relativeActiveTime);
    this.updateContext(IN_CODIO_SESSION, true);
  }

  /**
   * Update given context to given value and update manager.
   * @param context String representing context to update.
   * @param value Value to set given context string to.
   */
  private updateContext(context: string, value: unknown): void {
    commands.executeCommand('setContext', context, value);
  }

  /**
   * Play given events and media from given time in seconds.
   * @param events An array of event objects for the EditorPlayer to parse.
   * @param timeToStart Seconds to start playing media from.
   */
  play(events: CodioEvent[], timeToStart: number): void {
    if (this.isPlaying) {
      this.pauseMedia();
    }
    this.codioStartTime = Date.now(); // @note: Why isn't it timeToStart?
    this.editorPlayer.play(events, this.codioStartTime);
    this.subtitlesPlayer.play(timeToStart * 1000);
    this.audioPlayer.play(timeToStart);
    this.timer.run(timeToStart);
    this.isPlaying = true;
    this.updateContext(IS_PLAYING, this.isPlaying);
    this.listenToInteractions();
  }

  /**
   * Listen to mouse or keyboard interactions.
   */
  private listenToInteractions(): void {
    this.onPauseHandler = window.onDidChangeTextEditorSelection((e: TextEditorSelectionChangeEvent) => {
      if (e.kind) {
        this.onPauseHandler.dispose();
        this.pause();
      }
    });
  }

  /**
   * Stop the currently playing codio.
   */
  stop(): void {
    if (this.isPlaying) {
      this.pause();
    }
    this.closeCodio();
  }

  /**
   * Pause all media types: Editor, Audio, Subtitles, and Timeline.
   */
  private pauseMedia(): void {
    this.editorPlayer.pause();
    this.audioPlayer.pause();
    this.subtitlesPlayer.pause();
    this.timer.stop();
    this.onPauseHandler?.dispose();
  }

  pause(): void {
    this.lastStoppedTime = Date.now();
    this.pauseMedia();
    this.relativeActiveTime = this.relativeActiveTime + (this.lastStoppedTime - this.codioStartTime);
    this.isPlaying = false;
    this.updateContext(IS_PLAYING, this.isPlaying);
  }

  resume(): void {
    this.playFrom(this.relativeActiveTime);
  }

  //@TODO: should closeCodio just call pause? sometime it is called with pause before and sometime it doesn't. Probably a mistake
  closeCodio(): void {
    this.timer.stop();
    this.audioPlayer.pause();
    this.subtitlesPlayer.stop();
    this.closeCodioResolver();
    this.updateContext(IN_CODIO_SESSION, false);
    this.onPauseHandler?.dispose();
  }

  onTimerUpdate(observer: (currentSecond: number, totalSeconds: number) => void): void {
    this.timer.onUpdate(observer);
  }

  rewind(s: number): void {
    if (this.isPlaying) {
      this.pause();
    }
    let timeToRewind = this.relativeActiveTime - s * 1000;
    if (timeToRewind < 0) {
      timeToRewind = 0;
    }
    this.playFrom(timeToRewind);
  }

  forward(s: number): void {
    if (this.isPlaying) {
      this.pause();
    }
    let timeToForward = this.relativeActiveTime + s * 1000;
    if (timeToForward > this.codioLength) {
      timeToForward = this.codioLength;
    }
    this.playFrom(timeToForward);
  }

  async playFrom(relativeTimeToStart: number): Promise<void> {
    try {
      if (this.isPlaying) {
        this.pauseMedia();
      }
      await this.editorPlayer.moveToFrame(relativeTimeToStart);
      this.relativeActiveTime = relativeTimeToStart;
      const relevantRelativeEvents = this.editorPlayer.getTimeline(relativeTimeToStart);
      const timeToStartInSeconds = relativeTimeToStart / 1000;
      this.play(relevantRelativeEvents, timeToStartInSeconds);
      this.updateContext(IN_CODIO_SESSION, true);
    } catch (e) {
      console.log('play from fail', e);
    }
  }
}
