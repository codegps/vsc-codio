export declare const recordCodio: (destination: Uri, workspaceRoot?: Uri, getCodioName?: () => Promise<string>) => void;
export declare const saveRecording: () => Promise<void>;
export declare const playCodio: (source: Uri, workspaceUri?: Uri) => void;
export declare const playCodioTask: (source: Uri, workspaceUri?: Uri) => void;
export declare const pauseCodio: () => void;
export declare const pauseOrResume: () => void;
export declare const resumeCodio: () => void;
export declare const goto: (time: number) => Promise<void>;
export declare const rewind: (time: number) => void;
export declare const forward: (time: number) => void;
