import { message } from "antd";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { getExamById } from "../../../apicalls/exams";
import { addReport } from "../../../apicalls/reports";
import { HideLoading, ShowLoading } from "../../../redux/loaderSlice";
import Instructions from "./Instructions";
import { io } from "socket.io-client";
import { FaRegEye, FaRegClock } from "react-icons/fa";

function WriteExam() {
  const [examData, setExamData] = useState(null);
  const [questions = [], setQuestions] = useState([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [result = {}, setResult] = useState({});
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const params = useParams();
  const dispatch = useDispatch();
  // const navigate = useNavigate();
  const [view, setView] = useState("instructions");
  const [secondsLeft = 0, setSecondsLeft] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [intervalId, setIntervalId] = useState(null);
  const { user } = useSelector((state) => state.users);
  const [socket, setSocket] = useState(null);

  if (typeof window.testingTabSwitchBypass === "undefined") {
    window.testingTabSwitchBypass = false;
  }

  useEffect(() => {
    const savedCount = parseInt(sessionStorage.getItem("tabSwitchCount") || "0", 10);
    setTabSwitchCount(savedCount);
  }, []);

  useEffect(() => {
    if (!socket || !examData) return;

    socket.emit("join-exam-room", {
      examId: params.id,
      userId: user._id,
      name: user.name,
    });

    socket.on("leaderboard-update", (leaderboard) => {
      setLeaderboard(leaderboard);
    });

    return () => {
      socket.emit("leave-exam-room", {
        examId: params.id,
        userId: user._id,
      });
    };
  }, [socket, examData,params.id, user._id, user.name]);

  useEffect(() => {
    const handleTabSwitch = () => {
      if (view !== "questions" || window.testingTabSwitchBypass) return;

      let currentCount = parseInt(sessionStorage.getItem("tabSwitchCount") || "0", 10);
      currentCount += 1;

      sessionStorage.setItem("tabSwitchCount", currentCount);
      setTabSwitchCount(currentCount);

      if (currentCount === 1) {
        message.warning("Warning: Do not switch tabs. 2 attempts remaining.");
      } else if (currentCount === 2) {
        message.warning("Final Warning: 1 tab switch left before auto-submission.");
      } else if (currentCount >= 3) {
        message.error("Too many tab switches. Submitting exam...");
        clearInterval(intervalId);
        setTimeUp(true);

        if (socket) {
          socket.emit("exam-auto-submitted", {
            userId: user._id,
            examId: params.id,
            isAutoSubmitted: true,
          });
        }
      }

      if (socket) {
        socket.emit("tab-switch", {
          userId: user._id,
          examId: params.id,
          count: currentCount,
        });
      }
    };

    window.addEventListener("blur", handleTabSwitch);

    return () => {
      window.removeEventListener("blur", handleTabSwitch);
    };
  }, [view, intervalId, socket, user?._id, params.id]);

  useEffect(() => {
    const newSocket = io("process.env.REACT_APP_BACKEND_URL");
    setSocket(newSocket);

    newSocket.on("force-submit", () => {
      console.log("Force submit triggered by tab-switch count exceeding limit.");
      message.error("You switched tabs too many times! The exam has been submitted.");
      clearInterval(intervalId);
      setTimeUp(true);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [intervalId]);

  const getExamData = async () => {
    try {
      dispatch(ShowLoading());
      const response = await getExamById({
        examId: params.id,
      });
      dispatch(HideLoading());
      if (response.success) {
        setQuestions(response.data.questions);
        setExamData(response.data);
        setSecondsLeft(response.data.duration);
      } else {
        message.error(response.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  const calculateResult = async () => {
    try {
      let correctAnswers = [];
      let wrongAnswers = [];

      questions.forEach((question, index) => {
        if (question.correctOption === selectedOptions[index]) {
          correctAnswers.push(question);
        } else {
          wrongAnswers.push(question);
        }
      });

      let verdict = "Pass";
      if (correctAnswers.length < examData.passingMarks) {
        verdict = "Fail";
      }

      const tempResult = {
        correctAnswers,
        wrongAnswers,
        verdict,
      };
      setResult(tempResult);
      sessionStorage.removeItem("tabSwitchCount");
      dispatch(ShowLoading());
      const response = await addReport({
        exam: params.id,
        result: tempResult,
        user: user._id,
      });
      dispatch(HideLoading());
      if (response.success) {
        setView("result");
      } else {
        message.error(response.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  const startTimer = () => {
    let totalSeconds = examData.duration;
    const intervalId = setInterval(() => {
      if (totalSeconds > 0) {
        totalSeconds = totalSeconds - 1;
        setSecondsLeft(totalSeconds);
      } else {
        setTimeUp(true);
        clearInterval(intervalId);
      }
    }, 1000);
    setIntervalId(intervalId);
  };

  useEffect(() => {
    if (timeUp && view === "questions") {
      console.log("Time is up! Submitting the exam...");
      calculateResult();
    }
  }, [timeUp,calculateResult, view]);

  useEffect(() => {
    if (params.id) {
      console.log("Fetching exam data...");
      getExamData();
    }
  }, [getExamData, params.id]);

  return (
    examData && (
      <div className="mt-2">
        <div className="divider"></div>
        <div className="flex justify-between items-center gap-4">
          <h1 className="text-4xl">{examData.name}</h1>
          {view === "questions" && (
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <FaRegEye />
                <span>{tabSwitchCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <FaRegClock />
                <span>{Math.max(secondsLeft, 0)}s</span>
              </div>
            </div>
          )}
        </div>
        <div className="divider"></div>

        {view === "instructions" && (
          <Instructions
            examData={examData}
            setView={setView}
            startTimer={startTimer}
          />
        )}

        {view === "questions" && (
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl">
                  {selectedQuestionIndex + 1} :{" "}
                  {questions[selectedQuestionIndex].name}
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {Object.keys(questions[selectedQuestionIndex].options).map(
                (option, index) => {
                  return (
                    <div
                      className={`flex gap-2 flex-col ${
                        selectedOptions[selectedQuestionIndex] === option
                          ? "selected-option bg-gray-200"
                          : "option"
                      }`}
                      key={index}
                      onClick={() => {
                        const updatedOptions = {
                          ...selectedOptions,
                          [selectedQuestionIndex]: option,
                        };
                        setSelectedOptions(updatedOptions);

                        const correctCount = Object.keys(updatedOptions).filter(
                          (qIndex) => questions[qIndex]?.correctOption === updatedOptions[qIndex]
                        ).length;

                        socket.emit("progress-update", {
                          examId: params.id,
                          userId: user._id,
                          name: user.name,
                          correctAnswers: correctCount,
                          tabSwitchCount,
                        });
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <h1 className="text-xl">
                        {option} :{" "}
                        {questions[selectedQuestionIndex].options[option]}
                      </h1>
                    </div>
                  );
                }
              )}
            </div>

            <div className="flex justify-between">
              {selectedQuestionIndex < questions.length - 1 && (
                <button
                  className="primary-contained-btn"
                  onClick={() => {
                    setView("leaderboard");
                    setTimeout(() => {
                      setSelectedQuestionIndex((prev) => prev + 1);
                      setView("questions");
                    }, 3000);
                  }}
                >
                  Next
                </button>
              )}

              {selectedQuestionIndex === questions.length - 1 && (
                <button
                  className="primary-contained-btn"
                  onClick={() => {
                    sessionStorage.removeItem("tabSwitchCount");
                    clearInterval(intervalId);
                    setTimeUp(true);
                    calculateResult();
                  }}
                >
                  Submit
                </button>
              )}
            </div>
          </div>
        )}

        {view === "result" && (
          <div className="flex items-center mt-2 justify-center result">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl">RESULT</h1>
              <div className="divider"></div>
              <div className="marks">
                <h1 className="text-md">Total Marks : {examData.totalMarks}</h1>
                <h1 className="text-md">
                  Obtained Marks :{result.correctAnswers.length}
                </h1>
                <h1 className="text-md">
                  Wrong Answers : {result.wrongAnswers.length}
                </h1>
                <h1 className="text-md">
                  Passing Marks : {examData.passingMarks}
                </h1>
                <h1 className="text-md">VERDICT :{result.verdict}</h1>

                <div className="flex gap-2 mt-2">
                  <button
                    className="primary-outlined-btn"
                    onClick={() => {
                      sessionStorage.removeItem("tabSwitchCount");
                      setView("instructions");
                      setSelectedQuestionIndex(0);
                      setSelectedOptions({});
                      setSecondsLeft(examData.duration);
                    }}
                  >
                    Retake Exam
                  </button>
                  <button
                    className="primary-contained-btn"
                    onClick={() => {
                      setView("review");
                    }}
                  >
                    Review Answers
                  </button>
                </div>
              </div>
            </div>
            <div className="lottie-animation">
              {result.verdict === "Pass" && (
                <lottie-player
                  src="https://assets5.lottiefiles.com/packages/lf20_1pxqjqps.json"
                  background="transparent"
                  speed="1"
                  style={{ width: "300px", height: "300px" }}
                  loop
                  autoplay
                ></lottie-player>              
              )}
              {result.verdict === "Fail" && (
                <lottie-player
                  src="https://assets10.lottiefiles.com/packages/lf20_t24tpvcu.json"
                  background="transparent"
                  speed="1"
                  style={{ width: "300px", height: "300px" }}
                  loop
                  autoplay
                ></lottie-player>
              )}
            </div>
          </div>
        )}

        {view === "leaderboard" && (
          <div className="leaderboard mt-4 flex flex-col gap-4 items-center">
            <h1 className="text-2xl">Leaderboard</h1>
            <ul>
              {[...leaderboard]
                .sort((a, b) => b.correctAnswers - a.correctAnswers)
                .map((user, index) => (
                  <li key={index}>
                    {user.name} - {user.correctAnswers} Correct
                  </li>
                ))}
            </ul>
            <p className="text-sm text-gray-500">Next question will appear shortly...</p>
          </div>
        )}
      </div>
    )
  );
}

export default WriteExam;
