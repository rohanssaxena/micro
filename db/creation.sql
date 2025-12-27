-- =========================
-- COURSES
-- =========================
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    area TEXT,
    progress INTEGER CHECK (progress >= 0 AND progress <= 100),
    color VARCHAR(20)
);

-- =========================
-- LABELS
-- =========================
CREATE TABLE labels (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    level INTEGER,
    item TEXT,
    course_id INTEGER NOT NULL,
    CONSTRAINT fk_labels_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
);

-- =========================
-- TOPICS
-- =========================
CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    topic TEXT NOT NULL,
    description TEXT,
    weightage INTEGER CHECK (weightage >= 0 AND weightage <= 100),
    label_id INTEGER NOT NULL,
    question_guidelines TEXT,
    CONSTRAINT fk_topics_label
        FOREIGN KEY (label_id)
        REFERENCES labels(id)
        ON DELETE CASCADE
);

-- =========================
-- QUESTIONS
-- =========================
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    description TEXT,
    difficulty INTEGER CHECK (difficulty >= 1 AND difficulty <= 5),
    topic_id INTEGER NOT NULL,
    points INTEGER CHECK (points >= 0),
    CONSTRAINT fk_questions_topic
        FOREIGN KEY (topic_id)
        REFERENCES topics(id)
        ON DELETE CASCADE
);

-- =========================
-- ANSWERS
-- =========================
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    answer TEXT NOT NULL,
    explanation TEXT,
    correct BOOLEAN NOT NULL DEFAULT FALSE,
    question_id INTEGER NOT NULL,
    CONSTRAINT fk_answers_question
        FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE CASCADE
);
