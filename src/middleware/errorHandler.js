const errorHandler = (err, req, res, next) => {
  // Log the error for debugging purposes
  console.error(err);

  // Default to a 500 Internal Server Error
  let statusCode = err.statusCode || 500;
  let message = err.message || "An internal server error occurred.";

  // Customize status codes for specific error messages from the service layer
  if (err.message.toLowerCase().includes("not found")) {
    statusCode = 404;
  }

  res.status(statusCode).json({
    message: message,
    // Optionally include stack trace in development for easier debugging
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

export default errorHandler;