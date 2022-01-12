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
  inSession = false;
  codioPath: string;

  codioLength: number;
  codioStartTime: number;
  relativeActiveTimeMs = 0;

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
    this.relativeActiveTimeMs = 0;
    this.codioStartTime = undefined;
    this.codioLength = undefined;
    this.closeCodioResolver = undefined;
    this.process = undefined;
  }

  async startCodio(): Promise<void> {
    this.process = new Promise((resolve) => (this.closeCodioResolver = resolve));
    this.play(this.editorPlayer.events, this.relativeActiveTimeMs);
    this.inSession = true;
    this.updateContext(IN_CODIO_SESSION, this.inSession);
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
   * @param timeSecs Seconds to start playing media from.
   */
  play(events: CodioEvent[], timeSecs: number): void {
    if (this.isPlaying) {
      this.pauseMedia();
    }
    this.codioStartTime = Date.now(); // The editor adjusts events' time.
    this.editorPlayer.play(events, this.codioStartTime);
    this.subtitlesPlayer.play(timeSecs * 1000);
    this.audioPlayer.play(timeSecs);
    this.timer.run(timeSecs);
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
    this.editorPlayer.stop();
    this.audioPlayer.pause();
    this.subtitlesPlayer.pause();
    this.timer.stop();
    this.onPauseHandler?.dispose();
  }

  /**
   * Pause media, update relative active time, and update state.
   */
  pause(): void {
    this.pauseMedia();
    // How long has the codio been playing?
    this.relativeActiveTimeMs = this.relativeActiveTimeMs + (Date.now() - this.codioStartTime);
    this.isPlaying = false;
    this.updateContext(IS_PLAYING, this.isPlaying);
  }

  resume(): void {
    const events = this.editorPlayer.getEventsFrom(this.relativeActiveTimeMs);
    this.play(events, this.relativeActiveTimeMs / 1000);
  }

  //@TODO: should closeCodio just call pause? sometime it is called with pause before and sometime it doesn't. Probably a mistake
  closeCodio(): void {
    this.timer.stop();
    this.audioPlayer.pause();
    this.subtitlesPlayer.stop();
    this.closeCodioResolver();
    this.inSession = false;
    this.updateContext(IN_CODIO_SESSION, this.inSession);
    this.onPauseHandler?.dispose();
  }

  onTimerUpdate(observer: (currentSecond: number, totalSeconds: number) => void): void {
    this.timer.onUpdate(observer);
  }

  /**
   * Rewind codio that is playing.
   * @param timeSecs Time in seconds.
   */
  rewind(timeSecs: number): void {
    if (this.isPlaying) {
      this.relativeActiveTimeMs = this.relativeActiveTimeMs + (Date.now() - this.codioStartTime);
    }

    // Get time from when/if the codio was paused.
    let timeToRewind = this.relativeActiveTimeMs - timeSecs * 1000;
    if (timeToRewind < 0) {
      timeToRewind = 0;
    }
    this.playFrom(timeToRewind);
  }

  /**
   * Forward codio that is playing.
   * @param timeSecs Time in seconds.
   */
  forward(timeSecs: number): void {
    if (this.isPlaying) {
      this.relativeActiveTimeMs = this.relativeActiveTimeMs + (Date.now() - this.codioStartTime);
    }

    // Get time from when/if the codio was paused.
    let timeToForward = this.relativeActiveTimeMs + timeSecs * 1000;
    if (timeToForward > this.codioLength) {
      timeToForward = this.codioLength;
    }
    this.playFrom(timeToForward);
  }

  /**
   * Play codio from time given.
   * @param relativeTimeMs Time in milliseconds.
   */
  playFrom(relativeTimeMs: number): void {
    this.relativeActiveTimeMs = relativeTimeMs;
    if (this.isPlaying) {
      this.pauseMedia();
      this.resume();
    }
  }
}
