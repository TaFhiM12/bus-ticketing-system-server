export function generateSeatLayout(totalSeats, availableSeats) {
  const seats = [];
  const rows = Math.ceil(totalSeats / 4);
  let seatNumber = 1;
  
  const bookedSeats = totalSeats - availableSeats;
  const bookedSeatNumbers = [];
  
  // Randomly select booked seats
  for (let i = 0; i < bookedSeats; i++) {
    let randomSeat;
    do {
      randomSeat = Math.floor(Math.random() * totalSeats) + 1;
    } while (bookedSeatNumbers.includes(randomSeat));
    bookedSeatNumbers.push(randomSeat);
  }
  
  // Generate seat layout
  for (let row = 1; row <= rows; row++) {
    const rowSeats = [];
    
    for (let col = 1; col <= 4; col++) {
      if (seatNumber > totalSeats) break;
      
      const seatType = col === 2 ? "aisle" : col === 3 ? "aisle" : "window";
      const isBooked = bookedSeatNumbers.includes(seatNumber);
      
      rowSeats.push({
        seatNumber: seatNumber,
        type: seatType,
        status: isBooked ? "booked" : "available",
        priceMultiplier: seatType === "window" ? 1.0 : 0.95
      });
      
      seatNumber++;
    }
    
    if (rowSeats.length > 0) {
      seats.push({
        rowNumber: row,
        seats: rowSeats
      });
    }
  }
  
  return seats;
}