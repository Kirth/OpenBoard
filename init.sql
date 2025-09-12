-- Initialize the database schema
CREATE TABLE IF NOT EXISTS Boards (
    Id UUID PRIMARY KEY,
    Name VARCHAR(255) NOT NULL,
    CreatedAt TIMESTAMP DEFAULT NOW(),
    UpdatedAt TIMESTAMP DEFAULT NOW(),
    IsPublic BOOLEAN DEFAULT FALSE,
    AdminPin VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS BoardElements (
    Id UUID PRIMARY KEY,
    BoardId UUID REFERENCES Boards(Id) ON DELETE CASCADE,
    Type VARCHAR(50) NOT NULL,
    X DOUBLE PRECISION NOT NULL,
    Y DOUBLE PRECISION NOT NULL,
    Width DOUBLE PRECISION,
    Height DOUBLE PRECISION,
    ZIndex INTEGER DEFAULT 0,
    Data JSONB,
    CreatedBy VARCHAR(100),
    CreatedAt TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_board_elements_board_id ON BoardElements(BoardId);
CREATE INDEX IF NOT EXISTS idx_board_elements_type ON BoardElements(Type);

-- Insert a default board for testing
INSERT INTO Boards (Id, Name) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Default Board')
ON CONFLICT (Id) DO NOTHING;