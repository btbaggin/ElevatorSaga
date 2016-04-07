{
    init: function(elevators, floors) { 
        //Queues for who is waiting to go up or down
        var downQueue = [];
        var upQueue = [];
        for(var i = 0; i < floors.length; i++) {
            downQueue[i] = 0; upQueue[i] = 0;
        }
        
        //Add flag for if we should reverse the indicators when we reach
        for(var i = 0; i < elevators.length; i++) {
            elevators[i].reverseIndicators = true;
        }
        
        var setIndicators = function(elevator) {
            if(elevator.reverseIndicators) {
                elevator.goingDownIndicator(!elevator.goingDownIndicator());
                elevator.goingUpIndicator(!elevator.goingUpIndicator());
                elevator.reverseIndicators = false;
                return;
            }
            
            if(elevator.currentFloor() === floors.length - 1) {
                elevator.goingDownIndicator(true);
                elevator.goingUpIndicator(false);
            } else if(elevator.currentFloor() === 0) {
                elevator.goingUpIndicator(true);
                elevator.goingDownIndicator(false);
            }
        };
        
        var isFull = function(elevator) {
            return (1-elevator.loadFactor()) < (1.4/elevator.maxPassengerCount());
        }
        
        var visitFloor = function(elevator, floor) {
            var q;
            if(elevator.goingUpIndicator() || (elevator.reverseIndicators && elevator.goingDownIndicator())) { 
                upQueue[floor] -= elevator.maxPassengerCount();
                if(upQueue[floor] < 0) { upQueue[floor] = 0; } 
            } else if(elevator.goingDownIndicator() || (elevator.reverseIndicators && elevator.goingUpIndicator())) { 
                downQueue[floor] -= elevator.maxPassengerCount();
                if(downQueue[floor] < 0) { downQueue[floor] = 0; } 
            }       
            elevator.goToFloor(floor);
        };
        
        var elevatorsVisiting = function(elevator, floor) {
            for(var i = 0; i < elevators.length; i++) {
                if(elevators[i] !== elevator && elevators[i].destinationQueue.indexOf(floor) > -1) {
                    return true;
                }
            }
            return false;
        };

        // Whenever the elevator is idle (has no more queued destinations) ...
        for(var i = 0; i < elevators.length; i++) {
            elevators[i].on("idle", function() {
                var nextFloor = -1;
                var reverseVisit = -1;
                //Try to find floors to visit depending on what direction we are going
                //Priority:
                //  1. Someone pressed a floor
                //  2. Someone is waiting on the same floor
                //  3. Someone is waiting on a different floor to go the same direction we are heading
                //  4. Someone is waiting on a different floor to go the opposite direction we are heading
                if(this.goingUpIndicator()) {
                    for(var j = this.currentFloor() + 1; j < floors.length; j++) {
                        if(this.getPressedFloors().indexOf(j) > -1) {
                            nextFloor = j;
                            break;
                        }
                        
                        if(!isFull(this) && !elevatorsVisiting(this, j)) {
                            if(upQueue[j] > 0) {
                                nextFloor = j;
                                break;
                            } else if(downQueue[j] > 0) {
                                reverseVisit = j
                            }
                        }
                    }   
                } else if(this.goingDownIndicator()) {
                    for(var j = this.currentFloor() - 1; j >= 0; j--) {
                        if(this.getPressedFloors().indexOf(j) > -1) {
                            nextFloor = j;
                            break;
                        }
                        
                        if(!isFull(this) && !elevatorsVisiting(this, j)) {
                            if(downQueue[j] > 0) {
                                nextFloor = j;
                                break;
                            } else if(upQueue[j] > 0) {
                                reverseVisit = j;
                            }
                        }
                    }
                }
                
                if(nextFloor !== -1) {
                    //We have what floor we should go to  
                    visitFloor(this, nextFloor);
                } else {       
                    //Check if someone is waiting on the same floor
                    if(upQueue[this.currentFloor()] > 0) {
                        this.goingUpIndicator(true);
                        this.goingDownIndicator(false);
                        visitFloor(this, this.currentFloor());
                    } else if(downQueue[this.currentFloor()] > 0) {
                        this.goingDownIndicator(true);
                        this.goingUpIndicator(false);
                        visitFloor(this, this.currentFloor());
                    } else {
                        //Someone is on a different floor waiting to go the opposite direction
                        if(reverseVisit !== -1) {
                            this.reverseIndicators = true;
                            visitFloor(this, reverseVisit);
                            return;
                        } else {
                            //All failed, go back to ground
                            this.goToFloor(0);
                            this.goingDownIndicator(true);
                            this.goingUpIndicator(false);  
                        }
                    }
                }
            });
        }

        for(var i = 0; i < elevators.length; i++) {
            elevators[i].on("stopped_at_floor", function(floorNum) {                
                setIndicators(this);    
            });
        }
        
        for(var i = 0; i < elevators.length; i++) {
            elevators[i].on("passing_floor", function(floorNum, direction) {  
                //If we are passing the floor check if someone has queued between when we made the decision to move and now
                if(!isFull(this)) {
                    if(this.goingUpIndicator() && upQueue[floorNum] > 0) { 
                        upQueue[floorNum] -= this.maxPassengerCount(); 
                        if(upQueue[floorNum] < 0) {upQueue[floorNum] = 0; }
                        
                        //Clear queue and force stop on this level.  We will reevaluate moves when "idle" is called.
                        this.destinationQueue = [];
                        this.destinationQueue.push(floorNum);
                        this.checkDestinationQueue();
                    } else if(this.goingDownIndicator() && downQueue[floorNum] > 0) { 
                        downQueue[floorNum] -= this.maxPassengerCount(); 
                        if(downQueue[floorNum] < 0) {downQueue[floorNum] = 0; }
                        
                        //Clear queue and force stop on this level.  We will reevaluate moves when "idle" is called.
                        this.destinationQueue = [];
                        this.destinationQueue.push(floorNum);
                        this.checkDestinationQueue();
                    } 
                }                    
            });
        }
        
        for(var i = 0; i < floors.length; i++) {
            floors[i].on("up_button_pressed", function() {
                upQueue[this.floorNum()]++;
            });
        }

        for(var i = 0; i < floors.length; i++) {
            floors[i].on("down_button_pressed", function() {
                downQueue[this.floorNum()]++;
            });
        }
    },
        update: function(dt, elevators, floors) {
            // We normally don't need to do anything here
        }
}
