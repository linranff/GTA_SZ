// Copyright Epic Games, Inc. All Rights Reserved.

#include "TP_VehicleAdvWheelFront.h"
#include "UObject/ConstructorHelpers.h"

UTP_VehicleAdvWheelFront::UTP_VehicleAdvWheelFront()
{
	AxleType = EAxleType::Front;
	bAffectedBySteering = true;
	MaxSteerAngle = 40.f;
}