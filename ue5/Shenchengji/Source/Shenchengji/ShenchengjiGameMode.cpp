#include "ShenchengjiGameMode.h"
#include "LifeHud.h"
#include "UObject/ConstructorHelpers.h"

AShenchengjiGameMode::AShenchengjiGameMode()
{
	HUDClass = AShenchengjiLifeHud::StaticClass();

	static ConstructorHelpers::FClassFinder<APawn> CarFinder(TEXT("/Game/VehicleTemplate/Blueprints/SportsCar/BP_SportsCar_Pawn"));
	if (CarFinder.Succeeded())
	{
		DefaultPawnClass = CarFinder.Class;
	}

	static ConstructorHelpers::FClassFinder<APlayerController> ControllerFinder(TEXT("/Game/VehicleTemplate/Blueprints/BP_VehicleAdvPlayerController"));
	if (ControllerFinder.Succeeded())
	{
		PlayerControllerClass = ControllerFinder.Class;
	}
}
