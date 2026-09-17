// Copyright Epic Games, Inc. All Rights Reserved.

#include "TP_VehicleAdvWheelRear.h"
#include "UObject/ConstructorHelpers.h"

UTP_VehicleAdvWheelRear::UTP_VehicleAdvWheelRear()
{
	AxleType = EAxleType::Rear;
	bAffectedByHandbrake = true;
	bAffectedByEngine = true;
}